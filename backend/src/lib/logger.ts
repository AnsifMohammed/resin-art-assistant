import { pino, type LoggerOptions } from "pino";
import { config } from "../config.ts";

const isDev = config.NODE_ENV === "development";

// Query params whose values must never reach the logs (e.g. /ws?token=<jwt>).
const SENSITIVE_QUERY_PARAMS = new Set(["token", "access_token", "hub.verify_token"]);

/** Replace sensitive query-param values in a URL (path + query) with [redacted]. */
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const q = url.indexOf("?");
  if (q === -1) return url;
  const hashIdx = url.indexOf("#", q);
  const query = hashIdx === -1 ? url.slice(q + 1) : url.slice(q + 1, hashIdx);
  const hash = hashIdx === -1 ? "" : url.slice(hashIdx);
  const redacted = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      let key = rawKey;
      try {
        key = decodeURIComponent(rawKey.replace(/\+/g, " "));
      } catch {
        // keep raw key
      }
      return SENSITIVE_QUERY_PARAMS.has(key.toLowerCase()) ? `${rawKey}=[redacted]` : pair;
    })
    .join("&");
  return `${url.slice(0, q)}?${redacted}${hash}`;
}

interface LoggableRequest {
  method?: string;
  url?: string;
  host?: string;
  hostname?: string;
  ip?: string;
  socket?: { remoteAddress?: string; remotePort?: number };
}

export const serializers = {
  // Mirrors Fastify's default request serializer, minus secrets: the URL has
  // token-like query params redacted and headers are never included.
  req(req: LoggableRequest) {
    return {
      method: req.method,
      url: redactUrl(req.url),
      host: req.host ?? req.hostname,
      remoteAddress: req.ip ?? req.socket?.remoteAddress,
      remotePort: req.socket?.remotePort,
    };
  },
  res(res: { statusCode?: number }) {
    return { statusCode: res.statusCode };
  },
};

export const loggerOptions: LoggerOptions = {
  level: config.NODE_ENV === "test" ? "silent" : isDev ? "debug" : "info",
  serializers,
  // Never log credentials or auth headers (defence in depth if anything logs
  // raw headers).
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "headers.authorization",
      "headers.cookie",
      "password",
      "passwordHash",
      "token",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[redacted]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
};

export const logger = pino(loggerOptions);
