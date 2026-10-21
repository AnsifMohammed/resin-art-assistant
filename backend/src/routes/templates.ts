import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import {
  auditLog,
  messageTemplates,
  metaTemplateStatusEnum,
  templateCategoryEnum,
  templateChannelEnum,
} from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { extractVariables, templateMaxLength } from "../lib/templates.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireStaffOrAdmin } from "../middleware/requireStaffOrAdmin.ts";

type TemplateRow = typeof messageTemplates.$inferSelect;

/** Public shape of a template. */
function toTemplate(t: TemplateRow) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    channel: t.channel,
    body: t.body,
    variables: t.variables,
    isActive: t.isActive,
    metaTemplateName: t.metaTemplateName,
    metaStatus: t.metaStatus,
    createdByUserId: t.createdByUserId,
    updatedByUserId: t.updatedByUserId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const listQuerySchema = z.object({
  category: z.enum(templateCategoryEnum.enumValues).optional(),
  channel: z.enum(["whatsapp", "instagram"]).optional(),
  active: z.enum(["true", "false", "all"]).default("all"),
});

const templateFields = {
  name: z.string().trim().min(1).max(80),
  category: z.enum(templateCategoryEnum.enumValues),
  channel: z.enum(templateChannelEnum.enumValues),
  body: z.string().trim().min(1),
  isActive: z.boolean(),
  // Meta template names: lowercase letters, digits and underscores.
  metaTemplateName: z
    .string()
    .regex(/^[a-z0-9_]{1,512}$/, "Use lowercase letters, numbers and underscores")
    .nullable(),
  metaStatus: z.enum(metaTemplateStatusEnum.enumValues),
};

const bodyTooLong = (channel: TemplateRow["channel"]) =>
  `Body is too long for ${channel === "both" ? "WhatsApp and Instagram" : channel} (max ${templateMaxLength(channel)} characters)`;

// Unknown keys (including a client-sent `variables`) are stripped: variables
// are always computed from the body server-side.
const createTemplateSchema = z
  .object({
    ...templateFields,
    channel: templateFields.channel.default("both"),
    isActive: templateFields.isActive.optional(),
    metaTemplateName: templateFields.metaTemplateName.optional(),
    metaStatus: templateFields.metaStatus.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.body.length > templateMaxLength(t.channel)) {
      ctx.addIssue({ code: "custom", path: ["body"], message: bodyTooLong(t.channel) });
    }
  });

const updateTemplateSchema = z.object(templateFields).partial();

function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      400,
      message,
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

/** Postgres unique_violation, possibly wrapped by drizzle (DrizzleQueryError.cause). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

const nameTaken = () => new AppError(409, "A template with this name already exists", "TEMPLATE_NAME_TAKEN");

async function findTemplate(id: string, businessId: string, extra?: SQL): Promise<TemplateRow> {
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, id), eq(messageTemplates.businessId, businessId), extra));
  if (!template) {
    throw new AppError(404, "Template not found", "TEMPLATE_NOT_FOUND");
  }
  return template;
}

async function assertNameFree(businessId: string, name: string, exceptId?: string): Promise<void> {
  const [existing] = await db
    .select({ id: messageTemplates.id })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.businessId, businessId),
        eq(messageTemplates.name, name),
        exceptId ? ne(messageTemplates.id, exceptId) : undefined,
      ),
    );
  if (existing) throw nameTaken();
}

async function audit(request: FastifyRequest, action: string, template: Pick<TemplateRow, "id" | "name">) {
  await db.insert(auditLog).values({
    businessId: request.user.businessId,
    actorId: request.user.sub,
    actorType: request.user.role,
    action,
    details: { templateId: template.id, name: template.name },
  });
}

/** "<name> (Copy)", then "(Copy 2)", "(Copy 3)"… whichever is free. */
export function copyName(name: string, taken: Set<string>): string {
  let candidate = `${name} (Copy)`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name} (Copy ${n})`;
  return candidate;
}

export const templateRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /templates - Admin sees all; staff only active templates
  app.get(
    "/templates",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const { category, channel, active } = parseOrThrow(listQuerySchema, request.query, "Invalid query parameters");

      const conditions: SQL[] = [eq(messageTemplates.businessId, request.user.businessId)];
      if (category) conditions.push(eq(messageTemplates.category, category));
      if (channel) conditions.push(inArray(messageTemplates.channel, [channel, "both"]));
      if (request.user.role === "staff") {
        conditions.push(eq(messageTemplates.isActive, true));
      } else if (active !== "all") {
        conditions.push(eq(messageTemplates.isActive, active === "true"));
      }

      const rows = await db
        .select()
        .from(messageTemplates)
        .where(and(...conditions))
        .orderBy(asc(messageTemplates.category), asc(messageTemplates.name));

      return { templates: rows.map(toTemplate) };
    },
  );

  // GET /templates/:id - Staff cannot see inactive templates
  app.get<{ Params: { id: string } }>(
    "/templates/:id",
    { preHandler: [authenticate, requireStaffOrAdmin] },
    async (request) => {
      const template = await findTemplate(
        request.params.id,
        request.user.businessId,
        request.user.role === "staff" ? eq(messageTemplates.isActive, true) : undefined,
      );
      return { template: toTemplate(template) };
    },
  );

  // POST /templates - Create (admin only)
  app.post(
    "/templates",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const input = parseOrThrow(createTemplateSchema, request.body, "Invalid template payload");
      const businessId = request.user.businessId;

      await assertNameFree(businessId, input.name);

      let created: TemplateRow | undefined;
      try {
        [created] = await db
          .insert(messageTemplates)
          .values({
            businessId,
            name: input.name,
            category: input.category,
            channel: input.channel,
            body: input.body,
            variables: extractVariables(input.body),
            isActive: input.isActive ?? true,
            metaTemplateName: input.metaTemplateName ?? null,
            metaStatus: input.metaStatus ?? "not_submitted",
            createdByUserId: request.user.sub,
            updatedByUserId: request.user.sub,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw nameTaken();
        throw err;
      }

      if (!created) {
        throw new AppError(500, "Failed to create template", "INTERNAL_ERROR");
      }

      await audit(request, "template_created", created);
      return reply.status(201).send({ template: toTemplate(created) });
    },
  );

  // PATCH /templates/:id - Partial update (admin only)
  app.patch<{ Params: { id: string } }>(
    "/templates/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const input = parseOrThrow(updateTemplateSchema, request.body, "Invalid template payload");
      const businessId = request.user.businessId;
      const existing = await findTemplate(request.params.id, businessId);

      // The resulting body must still fit the resulting channel.
      const channel = input.channel ?? existing.channel;
      const body = input.body ?? existing.body;
      if (body.length > templateMaxLength(channel)) {
        throw new AppError(400, "Invalid template payload", "VALIDATION_ERROR", [
          { path: "body", message: bodyTooLong(channel) },
        ]);
      }

      if (input.name !== undefined && input.name !== existing.name) {
        await assertNameFree(businessId, input.name, existing.id);
      }

      let updated: TemplateRow | undefined;
      try {
        [updated] = await db
          .update(messageTemplates)
          .set({
            ...input,
            ...(input.body !== undefined ? { variables: extractVariables(input.body) } : {}),
            updatedByUserId: request.user.sub,
          })
          .where(and(eq(messageTemplates.id, existing.id), eq(messageTemplates.businessId, businessId)))
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw nameTaken();
        throw err;
      }

      if (!updated) {
        throw new AppError(404, "Template not found", "TEMPLATE_NOT_FOUND");
      }

      await audit(request, "template_updated", updated);
      return { template: toTemplate(updated) };
    },
  );

  // DELETE /templates/:id - Hard delete (admin only)
  app.delete<{ Params: { id: string } }>(
    "/templates/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const [deleted] = await db
        .delete(messageTemplates)
        .where(
          and(
            eq(messageTemplates.id, request.params.id),
            eq(messageTemplates.businessId, request.user.businessId),
          ),
        )
        .returning({ id: messageTemplates.id, name: messageTemplates.name });

      if (!deleted) {
        throw new AppError(404, "Template not found", "TEMPLATE_NOT_FOUND");
      }

      await audit(request, "template_deleted", deleted);
      return reply.status(204).send();
    },
  );

  // POST /templates/:id/duplicate - Copy with a free "(Copy N)" name (admin only)
  app.post<{ Params: { id: string } }>(
    "/templates/:id/duplicate",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const businessId = request.user.businessId;
      const source = await findTemplate(request.params.id, businessId);

      // A business has a handful of templates; reading all names is cheaper than a LIKE dance.
      const names = await db
        .select({ name: messageTemplates.name })
        .from(messageTemplates)
        .where(eq(messageTemplates.businessId, businessId));

      let created: TemplateRow | undefined;
      try {
        [created] = await db
          .insert(messageTemplates)
          .values({
            businessId,
            name: copyName(source.name, new Set(names.map((n) => n.name))),
            category: source.category,
            channel: source.channel,
            body: source.body,
            variables: extractVariables(source.body),
            isActive: source.isActive,
            // A copy is a new Meta template: it must be submitted and approved again.
            metaTemplateName: null,
            metaStatus: "not_submitted",
            createdByUserId: request.user.sub,
            updatedByUserId: request.user.sub,
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw nameTaken();
        throw err;
      }

      if (!created) {
        throw new AppError(500, "Failed to duplicate template", "INTERNAL_ERROR");
      }

      await audit(request, "template_duplicated", created);
      return reply.status(201).send({ template: toTemplate(created) });
    },
  );
};
