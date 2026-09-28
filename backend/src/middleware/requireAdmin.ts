import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors.ts";

export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user || request.user.role !== "admin") {
    throw new AppError(403, "Admin access required", "FORBIDDEN");
  }
}
