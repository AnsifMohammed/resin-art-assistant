import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import {
  auditLog,
  broadcastRecipients,
  broadcasts,
  broadcastSegmentEnum,
  broadcastStatusEnum,
  customers,
  messageTemplates,
  type BroadcastFilters,
} from "../db/schema.ts";
import { isBroadcastableTemplate, missingBroadcastVariables } from "../lib/broadcasts.ts";
import { AppError } from "../lib/errors.ts";
import type { Segment } from "../lib/segments.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { enqueueSendBroadcast } from "../queue/enqueueBroadcast.ts";
import { countAudience } from "../services/audience.ts";
import { broadcastStats, emitBroadcastProgress, emptyStats } from "../services/broadcastProgress.ts";

type BroadcastRow = typeof broadcasts.$inferSelect;
type BroadcastStatus = BroadcastRow["status"];

/** A scheduled time must be at least this far in the future. */
export const MIN_SCHEDULE_LEAD_MS = 60_000;

const filtersSchema = z.strictObject({
  city: z.string().trim().max(80).optional(),
  language: z.string().trim().max(40).optional(),
  excludeComplaints: z.boolean().optional(),
});

const broadcastFields = {
  name: z.string().trim().min(1).max(100),
  templateId: z.string().min(1),
  segment: z.enum(broadcastSegmentEnum.enumValues),
  filters: filtersSchema,
  variables: z.record(z.string(), z.string().max(1000)),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
};

const createSchema = z.strictObject({
  name: broadcastFields.name,
  templateId: broadcastFields.templateId,
  segment: broadcastFields.segment,
  filters: broadcastFields.filters.optional(),
  variables: broadcastFields.variables.optional(),
  scheduledAt: broadcastFields.scheduledAt.optional(),
  action: z.enum(["draft", "schedule", "send_now"]),
});

const patchSchema = z.strictObject({
  name: broadcastFields.name.optional(),
  templateId: broadcastFields.templateId.optional(),
  segment: broadcastFields.segment.optional(),
  filters: broadcastFields.filters.optional(),
  variables: broadcastFields.variables.optional(),
  scheduledAt: broadcastFields.scheduledAt.optional(),
  action: z.enum(["schedule", "send_now"]).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(broadcastStatusEnum.enumValues).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const detailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const audienceQuerySchema = z.object({
  segment: z.enum(broadcastSegmentEnum.enumValues).default("all"),
  city: z.string().trim().max(80).optional().transform((v) => v || undefined),
  language: z.string().trim().max(40).optional().transform((v) => v || undefined),
  excludeComplaints: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

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

const invalid = (path: string, message: string) =>
  new AppError(400, "Invalid broadcast payload", "VALIDATION_ERROR", [{ path, message }]);

const notFound = () => new AppError(404, "Broadcast not found", "NOT_FOUND");
const locked = (status: string) =>
  new AppError(409, `A ${status} broadcast can no longer be changed`, "BROADCAST_LOCKED");

/** Drop empty filter values so stored filters stay minimal. */
function cleanFilters(f: z.infer<typeof filtersSchema> | undefined): BroadcastFilters {
  const out: BroadcastFilters = {};
  if (f?.city) out.city = f.city;
  if (f?.language) out.language = f.language;
  if (f?.excludeComplaints) out.excludeComplaints = true;
  return out;
}

function parseScheduledAt(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(value);
}

function assertFutureSchedule(at: Date | null | undefined): void {
  if (!at) throw invalid("scheduledAt", "scheduledAt is required to schedule a broadcast");
  if (at.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
    throw invalid("scheduledAt", "scheduledAt must be at least 1 minute in the future");
  }
}

interface BroadcastSpec {
  templateId: string;
  segment: Segment;
  filters: BroadcastFilters;
  variables: Record<string, string>;
}

/**
 * Template approved for WhatsApp, every variable (except customerName) filled,
 * and an audience between 1 and BROADCAST_MAX_RECIPIENTS. Returns the audience size.
 */
async function validateSpec(businessId: string, spec: BroadcastSpec): Promise<number> {
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.id, spec.templateId), eq(messageTemplates.businessId, businessId)));
  if (!template || !isBroadcastableTemplate(template)) {
    throw new AppError(400, "Broadcasts need a WhatsApp template approved by Meta", "TEMPLATE_NOT_APPROVED");
  }

  const missing = missingBroadcastVariables(template.body, spec.variables);
  if (missing.length > 0) {
    throw new AppError(
      400,
      `Missing template variables: ${missing.join(", ")}`,
      "TEMPLATE_VARIABLES_MISSING",
      missing.map((m) => ({ path: m, message: "required" })),
    );
  }

  const count = await countAudience({ businessId, segment: spec.segment, filters: spec.filters });
  if (count < 1) {
    throw new AppError(400, "No WhatsApp customers match this audience", "EMPTY_AUDIENCE");
  }
  if (count > config.BROADCAST_MAX_RECIPIENTS) {
    throw new AppError(
      409,
      `Audience of ${count} is over the limit of ${config.BROADCAST_MAX_RECIPIENTS} recipients`,
      "AUDIENCE_TOO_LARGE",
      { count, max: config.BROADCAST_MAX_RECIPIENTS },
    );
  }
  return count;
}

/** BroadcastSummary for each row (template name + recipient stats: two queries total). */
async function toSummaries(rows: BroadcastRow[]) {
  if (rows.length === 0) return [];
  const templateIds = [...new Set(rows.map((r) => r.templateId))];
  const [templates, stats] = await Promise.all([
    db
      .select({ id: messageTemplates.id, name: messageTemplates.name })
      .from(messageTemplates)
      .where(inArray(messageTemplates.id, templateIds)),
    broadcastStats(rows.map((r) => r.id)),
  ]);
  const templateNames = new Map(templates.map((t) => [t.id, t.name]));

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    templateId: b.templateId,
    templateName: templateNames.get(b.templateId) ?? null,
    segment: b.segment,
    filters: b.filters ?? {},
    variables: b.variables ?? {},
    status: b.status,
    scheduledAt: b.scheduledAt,
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    recipientCount: b.recipientCount,
    error: b.error ?? null,
    stats: stats.get(b.id) ?? emptyStats(),
    createdAt: b.createdAt,
    createdByUserId: b.createdByUserId,
  }));
}

async function toSummary(row: BroadcastRow) {
  const [summary] = await toSummaries([row]);
  return summary!;
}

async function findBroadcast(id: string, businessId: string): Promise<BroadcastRow> {
  const [row] = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.id, id), eq(broadcasts.businessId, businessId)));
  if (!row) throw notFound();
  return row;
}

async function audit(request: FastifyRequest, action: string, b: Pick<BroadcastRow, "id" | "name">, extra = {}) {
  await db.insert(auditLog).values({
    businessId: request.user.businessId,
    actorId: request.user.sub,
    actorType: request.user.role,
    action,
    details: { broadcastId: b.id, name: b.name, ...extra },
  });
}

const auditForStatus: Partial<Record<BroadcastStatus, string>> = {
  scheduled: "broadcast_scheduled",
  sending: "broadcast_started",
};

export const broadcastRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const admin = { preHandler: [authenticate, requireAdmin] };

  // GET /broadcasts/audience - live audience size for the composer
  app.get("/broadcasts/audience", admin, async (request) => {
    const q = parseOrThrow(audienceQuerySchema, request.query, "Invalid query parameters");
    const count = await countAudience({
      businessId: request.user.businessId,
      segment: q.segment,
      filters: cleanFilters({ city: q.city, language: q.language, excludeComplaints: q.excludeComplaints }),
    });
    return { count, max: config.BROADCAST_MAX_RECIPIENTS };
  });

  // GET /broadcasts - newest first
  app.get("/broadcasts", admin, async (request) => {
    const q = parseOrThrow(listQuerySchema, request.query, "Invalid query parameters");
    const businessId = request.user.businessId;
    const where = and(eq(broadcasts.businessId, businessId), q.status ? eq(broadcasts.status, q.status) : undefined);

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(broadcasts)
        .where(where)
        .orderBy(desc(broadcasts.createdAt), asc(broadcasts.id))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db.select({ count: sql<number>`count(*)::int`.mapWith(Number) }).from(broadcasts).where(where),
    ]);

    return {
      broadcasts: await toSummaries(rows),
      pagination: { page: q.page, limit: q.limit, total: Number(totalRows[0]?.count ?? 0) },
    };
  });

  // GET /broadcasts/:id - summary + paged recipients
  app.get<{ Params: { id: string } }>("/broadcasts/:id", admin, async (request) => {
    const q = parseOrThrow(detailQuerySchema, request.query, "Invalid query parameters");
    const b = await findBroadcast(request.params.id, request.user.businessId);

    const [recipients, totalRows] = await Promise.all([
      db
        .select({
          id: broadcastRecipients.id,
          customerId: broadcastRecipients.customerId,
          customerName: customers.name,
          phone: broadcastRecipients.phone,
          status: broadcastRecipients.status,
          error: broadcastRecipients.error,
          sentAt: broadcastRecipients.sentAt,
          deliveredAt: broadcastRecipients.deliveredAt,
          readAt: broadcastRecipients.readAt,
        })
        .from(broadcastRecipients)
        .leftJoin(customers, eq(customers.id, broadcastRecipients.customerId))
        .where(eq(broadcastRecipients.broadcastId, b.id))
        .orderBy(asc(broadcastRecipients.createdAt), asc(broadcastRecipients.id))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(broadcastRecipients)
        .where(eq(broadcastRecipients.broadcastId, b.id)),
    ]);

    return {
      broadcast: await toSummary(b),
      recipients: recipients.map((r) => ({ ...r, customerName: r.customerName ?? null })),
      pagination: { page: q.page, limit: q.limit, total: Number(totalRows[0]?.count ?? 0) },
    };
  });

  // POST /broadcasts - create as draft, schedule, or send now
  app.post("/broadcasts", admin, async (request, reply) => {
    const input = parseOrThrow(createSchema, request.body, "Invalid broadcast payload");
    const businessId = request.user.businessId;

    const scheduledAt = parseScheduledAt(input.scheduledAt) ?? null;
    if (input.action === "schedule") assertFutureSchedule(scheduledAt);
    else if (scheduledAt && input.action === "draft") assertFutureSchedule(scheduledAt);

    const spec: BroadcastSpec = {
      templateId: input.templateId,
      segment: input.segment,
      filters: cleanFilters(input.filters),
      variables: input.variables ?? {},
    };
    await validateSpec(businessId, spec);

    const status: BroadcastStatus =
      input.action === "draft" ? "draft" : input.action === "schedule" ? "scheduled" : "sending";

    const [created] = await db
      .insert(broadcasts)
      .values({
        businessId,
        name: input.name,
        ...spec,
        status,
        scheduledAt: status === "sending" ? null : scheduledAt,
        startedAt: status === "sending" ? new Date() : null,
        createdByUserId: request.user.sub,
      })
      .returning();
    if (!created) throw new AppError(500, "Failed to create broadcast", "INTERNAL_ERROR");

    await audit(request, "broadcast_created", created, { segment: created.segment, status });
    const statusAction = auditForStatus[status];
    if (statusAction) await audit(request, statusAction, created, { scheduledAt: created.scheduledAt });

    await emitBroadcastProgress(businessId, created.id, { force: true, status });
    if (status === "sending") await enqueueSendBroadcast({ broadcastId: created.id, businessId });

    return reply.status(201).send({ broadcast: await toSummary(created) });
  });

  // PATCH /broadcasts/:id - edit a draft/scheduled broadcast; optionally schedule or send it
  app.patch<{ Params: { id: string } }>("/broadcasts/:id", admin, async (request) => {
    const input = parseOrThrow(patchSchema, request.body ?? {}, "Invalid broadcast payload");
    const businessId = request.user.businessId;
    const existing = await findBroadcast(request.params.id, businessId);
    if (existing.status !== "draft" && existing.status !== "scheduled") throw locked(existing.status);

    const status: BroadcastStatus =
      input.action === "send_now" ? "sending" : input.action === "schedule" ? "scheduled" : existing.status;

    const scheduledAtInput = parseScheduledAt(input.scheduledAt);
    const scheduledAt = scheduledAtInput === undefined ? existing.scheduledAt : scheduledAtInput;
    if (status === "scheduled" && (input.action === "schedule" || scheduledAtInput !== undefined)) {
      assertFutureSchedule(scheduledAt);
    } else if (status === "draft" && scheduledAtInput) {
      assertFutureSchedule(scheduledAtInput);
    }

    const spec: BroadcastSpec = {
      templateId: input.templateId ?? existing.templateId,
      segment: input.segment ?? existing.segment,
      filters: input.filters !== undefined ? cleanFilters(input.filters) : (existing.filters ?? {}),
      variables: input.variables ?? existing.variables ?? {},
    };
    await validateSpec(businessId, spec);

    // Guarded on the status we read: the dispatcher may have claimed it meanwhile.
    const [updated] = await db
      .update(broadcasts)
      .set({
        name: input.name ?? existing.name,
        ...spec,
        status,
        scheduledAt: status === "sending" ? existing.scheduledAt : scheduledAt,
        ...(status === "sending" ? { startedAt: new Date() } : {}),
      })
      .where(
        and(eq(broadcasts.id, existing.id), eq(broadcasts.businessId, businessId), eq(broadcasts.status, existing.status)),
      )
      .returning();
    if (!updated) throw locked("started");

    await audit(request, "broadcast_updated", updated, { status });
    const statusAction = status !== existing.status ? auditForStatus[status] : undefined;
    if (statusAction) await audit(request, statusAction, updated, { scheduledAt: updated.scheduledAt });

    await emitBroadcastProgress(businessId, updated.id, { force: true, status });
    if (status === "sending") await enqueueSendBroadcast({ broadcastId: updated.id, businessId });

    return { broadcast: await toSummary(updated) };
  });

  // POST /broadcasts/:id/cancel - scheduled or sending → cancelled
  app.post<{ Params: { id: string } }>("/broadcasts/:id/cancel", admin, async (request) => {
    const businessId = request.user.businessId;
    const existing = await findBroadcast(request.params.id, businessId);
    if (existing.status !== "scheduled" && existing.status !== "sending") throw locked(existing.status);

    // Atomic: only cancels if nobody changed the status since we read it. A
    // sending job notices the cancel between batches and stops.
    const [cancelled] = await db
      .update(broadcasts)
      .set({ status: "cancelled", completedAt: new Date() })
      .where(
        and(eq(broadcasts.id, existing.id), eq(broadcasts.businessId, businessId), eq(broadcasts.status, existing.status)),
      )
      .returning();
    if (!cancelled) throw locked("finished");

    await audit(request, "broadcast_cancelled", cancelled, { from: existing.status });
    await emitBroadcastProgress(businessId, cancelled.id, { force: true, status: "cancelled" });
    return { broadcast: await toSummary(cancelled) };
  });

  // DELETE /broadcasts/:id - drafts only
  app.delete<{ Params: { id: string } }>("/broadcasts/:id", admin, async (request, reply) => {
    const businessId = request.user.businessId;
    const existing = await findBroadcast(request.params.id, businessId);
    if (existing.status !== "draft") throw locked(existing.status);

    const [deleted] = await db
      .delete(broadcasts)
      .where(and(eq(broadcasts.id, existing.id), eq(broadcasts.businessId, businessId), eq(broadcasts.status, "draft")))
      .returning({ id: broadcasts.id, name: broadcasts.name });
    if (!deleted) throw locked("started");

    await audit(request, "broadcast_deleted", deleted);
    return reply.status(204).send();
  });
};
