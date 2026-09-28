import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { auditLog, users } from "../db/schema.ts";
import { AppError } from "../lib/errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { invalidateUserStatus } from "../lib/userStatus.ts";
import { disconnectUserEverywhere } from "../realtime/events.ts";
import { sendStaffWelcome } from "../services/email.ts";

type UserRow = typeof users.$inferSelect;

/** Public shape of a user. Never includes passwordHash. */
function toPublicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  };
}

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const updateUserSchema = z.object({
  active: z.boolean(),
});

export const userRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /users - List staff members only (never admins)
  app.get(
    "/users",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const staffList = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          active: users.active,
          lastLoginAt: users.lastLoginAt,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(
          and(
            eq(users.businessId, request.user.businessId),
            eq(users.role, "staff"),
          ),
        )
        .orderBy(desc(users.createdAt));

      return { users: staffList };
    },
  );

  // POST /users - Create new staff user (returns 201)
  app.post(
    "/users",
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid staff user payload", "VALIDATION_ERROR");
      }

      const { name, email, password } = parsed.data;
      const normalizedEmail = email.toLowerCase().trim();
      const businessId = request.user.businessId;

      // Check unique email across users
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail));

      if (existing) {
        throw new AppError(409, "User with this email already exists", "EMAIL_TAKEN");
      }

      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      const [newUser] = await db
        .insert(users)
        .values({
          businessId,
          name,
          email: normalizedEmail,
          passwordHash,
          role: "staff",
          active: true,
        })
        .returning();

      if (!newUser) {
        throw new AppError(500, "Failed to create staff user", "INTERNAL_ERROR");
      }

      // Send transactional welcome email with credentials
      await sendStaffWelcome({
        to: newUser.email,
        name: newUser.name,
        email: newUser.email,
        temporaryPassword: password,
        dashboardUrl: config.DASHBOARD_URL,
      });

      // Audit log
      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: "user_created",
        targetUserId: newUser.id,
        details: {
          name: newUser.name,
          email: newUser.email,
          role: "staff",
        },
      });

      return reply.status(201).send({ user: toPublicUser(newUser) });
    },
  );

  // PATCH /users/:id - Deactivate or reactivate staff
  app.patch<{ Params: { id: string } }>(
    "/users/:id",
    { preHandler: [authenticate, requireAdmin] },
    async (request) => {
      const { id } = request.params;
      const businessId = request.user.businessId;

      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid update payload", "VALIDATION_ERROR");
      }

      const { active } = parsed.data;

      const [targetUser] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.id, id),
            eq(users.businessId, businessId),
          ),
        );

      if (!targetUser) {
        throw new AppError(404, "User not found", "NOT_FOUND");
      }

      if (targetUser.role === "admin") {
        throw new AppError(403, "Cannot modify an admin user", "FORBIDDEN");
      }

      const [updated] = await db
        .update(users)
        .set({ active })
        .where(and(eq(users.id, id), eq(users.businessId, businessId)))
        .returning();

      if (!updated) {
        throw new AppError(404, "User not found", "NOT_FOUND");
      }

      // Take effect immediately: drop the cached status and, on
      // deactivation, close the user's open realtime connections.
      invalidateUserStatus(id);
      if (!active) disconnectUserEverywhere(businessId, id);

      await db.insert(auditLog).values({
        businessId,
        actorId: request.user.sub,
        actorType: "admin",
        action: active ? "user_reactivated" : "user_deactivated",
        targetUserId: id,
        details: { active },
      });

      return { user: toPublicUser(updated) };
    },
  );
};
