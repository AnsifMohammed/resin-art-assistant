import { Sentry } from "./instrument.ts";

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fjwt from "@fastify/jwt";
import { config } from "./config.ts";
import { loggerOptions } from "./lib/logger.ts";
import { errorHandler, notFoundHandler } from "./lib/errors.ts";
import { registerRoutes } from "./routes/index.ts";

import { sql } from "./db/index.ts";
import { startWorkers, stopWorkers } from "./queue/worker.ts";
import { startRealtimeBus, stopRealtimeBus } from "./realtime/bus.ts";

import fws from "@fastify/websocket";

export async function buildServer() {
  // loggerOptions carries serializers that redact tokens from logged URLs.
  // trustProxy defaults to false so X-Forwarded-For cannot spoof request.ip.
  const app = Fastify({ logger: loggerOptions, trustProxy: config.TRUST_PROXY });

  Sentry.setupFastifyErrorHandler(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.NODE_ENV === "production" ? config.DASHBOARD_URL : true,
    credentials: true,
    exposedHeaders: ["Retry-After"],
  });

  await app.register(fws);

  await app.register(fjwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: config.JWT_EXPIRES_IN,
    },
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  await registerRoutes(app);
  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    // Cross-process realtime fan-out; without it events still reach this process's sockets.
    await startRealtimeBus().catch((err: unknown) => app.log.error({ err }, "Realtime bus failed to start"));
    await startWorkers();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    try {
      await app.close();
      await stopWorkers();
      await stopRealtimeBus();
      await sql.end({ timeout: 5 });
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (config.NODE_ENV !== "test") {
  await start();
}
