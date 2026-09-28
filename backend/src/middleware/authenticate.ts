import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors.ts";
import { assertUserActive } from "../lib/userStatus.ts";

export interface JwtPayload {
  sub: string;
  businessId: string;
  role: "admin" | "staff";
  name: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid authorization header", "UNAUTHORIZED");
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AppError(401, "Missing authorization token", "UNAUTHORIZED");
  }

  let payload: JwtPayload;
  try {
    payload = await request.jwtVerify<JwtPayload>();
  } catch (_err) {
    throw new AppError(401, "Invalid or expired token", "UNAUTHORIZED");
  }

  // A valid signature is not enough: the account must still exist, be active
  // and belong to the business named in the token.
  await assertUserActive(payload.sub, payload.businessId);
  request.user = payload;
}
