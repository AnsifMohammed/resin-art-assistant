import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors.ts";

export async function requireStaffOrAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user || (request.user.role !== "admin" && request.user.role !== "staff")) {
    throw new AppError(403, "Staff or admin access required", "FORBIDDEN");
  }
}
