import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.ts";
import { auditLog, businesses, channels } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { emitSettingsUpdated } from "../realtime/events.ts";

const pauseSchema = z.object({
  paused: z.boolean(),
});

// ─── Business hours / away message / window alerts ──────────────────────────
// Stored in businesses.settings jsonb under snake_case keys (next to
// automation_paused); returned camelCase. Only STORED for now: nothing sends
// the away message or window alerts yet.

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = (typeof DAYS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected 24h time HH:mm");

const businessHoursSchema = z
  .object({
    enabled: z.boolean(),
    open: hhmm,
    close: hhmm,
    days: z
      .array(z.enum(DAYS))
      .min(1, "Pick at least one day")
      .refine((d) => new Set(d).size === d.length, "Days must be unique"),
  })
  .strict()
  .refine((h) => h.close > h.open, { message: "close must be after open", path: ["close"] });

const awayMessageSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().trim().min(1).max(500),
  })
  .strict();

const windowAlertsSchema = z
  .object({
    enabled: z.boolean(),
    thresholdMinutes: z.union([z.literal(60), z.literal(120), z.literal(240)]),
    target: z.enum(["push", "whatsapp"]),
  })
  .strict();

type BusinessHours = z.infer<typeof businessHoursSchema>;
type AwayMessage = z.infer<typeof awayMessageSchema>;
type WindowAlerts = z.infer<typeof windowAlertsSchema>;

export const SETTINGS_DEFAULTS: {
  businessHours: BusinessHours;
  awayMessage: AwayMessage;
  windowAlerts: WindowAlerts;
} = {
  businessHours: { enabled: false, open: "09:00", close: "21:00", days: [...DAYS] },
  awayMessage: { enabled: false, text: "Hi! We're closed right now 🌙 We'll reply as soon as we're back." },
  windowAlerts: { enabled: false, thresholdMinutes: 120, target: "push" },
};

/** API key → businesses.settings jsonb key. */
const STORAGE_KEYS = {
  businessHours: "business_hours",
  awayMessage: "away_message",
  windowAlerts: "window_alerts",
} as const;
type SectionKey = keyof typeof STORAGE_KEYS;

const SECTION_SCHEMAS = {
  businessHours: businessHoursSchema,
  awayMessage: awayMessageSchema,
  windowAlerts: windowAlertsSchema,
} as const;

/** PATCH body: every section optional; a section may be partial (merged onto the current value). */
const patchSettingsSchema = z
  .object({
    businessHours: z
      .object({
        enabled: z.boolean(),
        open: hhmm,
        close: hhmm,
        days: z.array(z.enum(DAYS)),
      })
      .partial()
      .strict()
      .optional(),
    awayMessage: z.object({ enabled: z.boolean(), text: z.string() }).partial().strict().optional(),
    windowAlerts: z
      .object({
        enabled: z.boolean(),
        thresholdMinutes: z.number(),
        target: z.string(),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to update");

const sortDays = (days: Day[]): Day[] => DAYS.filter((d) => days.includes(d));

/** Read one stored section, falling back to defaults for missing or invalid data. */
function readSection<K extends SectionKey>(stored: Record<string, unknown>, key: K): (typeof SETTINGS_DEFAULTS)[K] {
  const raw = stored[STORAGE_KEYS[key]];
  const defaults = SETTINGS_DEFAULTS[key];
  if (!raw || typeof raw !== "object") return structuredClone(defaults);
  const parsed = SECTION_SCHEMAS[key].safeParse({ ...defaults, ...(raw as object) });
  return (parsed.success ? parsed.data : structuredClone(defaults)) as (typeof SETTINGS_DEFAULTS)[K];
}

function readSections(stored: Record<string, unknown>) {
  const businessHours = readSection(stored, "businessHours");
  return {
    businessHours: { ...businessHours, days: sortDays(businessHours.days) },
    awayMessage: readSection(stored, "awayMessage"),
    windowAlerts: readSection(stored, "windowAlerts"),
  };
}

async function loadSettings(businessId: string): Promise<Record<string, unknown>> {
  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return (biz?.settings as Record<string, unknown>) || {};
}

async function settingsResponse(businessId: string, stored: Record<string, unknown>) {
  const bizChannels = await db
    .select({
      id: channels.id,
      type: channels.type,
      identifier: channels.identifier,
      status: channels.status,
      tokenExpiresAt: channels.tokenExpiresAt,
    })
    .from(channels)
    .where(eq(channels.businessId, businessId));

  return {
    paused: Boolean(stored.automation_paused),
    channels: bizChannels,
    ...readSections(stored),
  };
}

export const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /settings - Admin only
  app.get(
    "/settings",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      return settingsResponse(businessId, await loadSettings(businessId));
    },
  );

  // PATCH /settings - Update business hours, away message, window alerts (admin only)
  app.patch(
    "/settings",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const body = patchSettingsSchema.parse(request.body ?? {}); // ZodError → 400 with details

      const stored = await loadSettings(businessId);
      const current = readSections(stored);

      const changed: SectionKey[] = [];
      const next: Partial<Record<SectionKey, unknown>> = {};
      for (const key of Object.keys(STORAGE_KEYS) as SectionKey[]) {
        const patch = body[key];
        if (patch === undefined) continue;
        const result = SECTION_SCHEMAS[key].safeParse({ ...current[key], ...patch });
        if (!result.success) {
          throw new z.ZodError(result.error.issues.map((i) => ({ ...i, path: [key, ...i.path] })));
        }
        const merged = result.data;
        next[key] = key === "businessHours" ? { ...merged, days: sortDays((merged as BusinessHours).days) } : merged;
        changed.push(key);
      }

      // Merge only the changed sections into the jsonb (atomically), so
      // automation_paused and any other keys are never dropped.
      const patchJson: Record<string, unknown> = {};
      for (const key of changed) patchJson[STORAGE_KEYS[key]] = next[key];

      await db
        .update(businesses)
        .set({ settings: sql`coalesce(${businesses.settings}, '{}'::jsonb) || ${JSON.stringify(patchJson)}::jsonb` })
        .where(eq(businesses.id, businessId));

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "settings_updated",
        details: { changed, ...next },
      });

      const updated = { ...stored, ...patchJson };
      emitSettingsUpdated(businessId, { paused: Boolean(updated.automation_paused) });

      return settingsResponse(businessId, updated);
    },
  );

  // POST /settings/pause - Pause or resume automation globally
  app.post(
    "/settings/pause",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const businessId = request.user.businessId;
      const parsed = pauseSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid payload", "VALIDATION_ERROR");
      }

      const { paused } = parsed.data;

      const [biz] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId));

      const currentSettings = (biz?.settings as Record<string, unknown>) || {};
      const updatedSettings = { ...currentSettings, automation_paused: paused };

      await db
        .update(businesses)
        .set({ settings: updatedSettings })
        .where(eq(businesses.id, businessId));

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: paused ? "automation_paused" : "automation_resumed",
        details: { paused },
      });

      emitSettingsUpdated(businessId, { paused });

      return {
        ok: true,
        paused,
      };
    },
  );
};
