// Sentry must be initialised before anything else is imported.
// index.ts imports this file first. For full ESM auto-instrumentation
// (performance tracing), start node with `--import ./dist/instrument.js`.
import * as Sentry from "@sentry/node";
import { config } from "./config.ts";

Sentry.init({
  ...(config.SENTRY_DSN ? { dsn: config.SENTRY_DSN } : {}),
  environment: config.NODE_ENV,
  enabled: config.NODE_ENV === "production" && Boolean(config.SENTRY_DSN),
  tracesSampleRate: 0.2,
  integrations: [Sentry.fastifyIntegration()],
});

export { Sentry };
