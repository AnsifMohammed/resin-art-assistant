import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { config } from "../config.ts";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

interface ErrorBody {
  error: string;
  code: string;
  details?: unknown;
  stack?: string;
}

const isProduction = () => config.NODE_ENV === "production";

function withStack(body: ErrorBody, err: Error): ErrorBody {
  return isProduction() || !err.stack ? body : { ...body, stack: err.stack };
}

export function errorHandler(
  err: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) request.log.error({ err }, err.message);
    return reply.status(err.statusCode).send({ error: err.message, code: err.code });
  }

  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  const fastifyErr = err as FastifyError;

  // Fastify's own schema validation errors
  if (fastifyErr.validation) {
    return reply.status(400).send({
      error: fastifyErr.message,
      code: "VALIDATION_ERROR",
    });
  }

  // Other client errors raised by Fastify (bad JSON, payload too large, etc.)
  const status = fastifyErr.statusCode ?? 500;
  if (status >= 400 && status < 500) {
    return reply.status(status).send({
      error: fastifyErr.message,
      code: fastifyErr.code ?? "BAD_REQUEST",
    });
  }

  request.log.error({ err }, "Unhandled error");
  return reply
    .status(500)
    .send(withStack({ error: "Internal server error", code: "INTERNAL_ERROR" }, err));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(404).send({
    error: `Route ${request.method} ${request.url} not found`,
    code: "NOT_FOUND",
  });
}
