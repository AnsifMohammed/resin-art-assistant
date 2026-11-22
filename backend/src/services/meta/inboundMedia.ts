import { config } from "../../config.ts";
import { logger } from "../../lib/logger.ts";
import { uploadBufferToCloudinary } from "../cloudinary.ts";
import { WHATSAPP_API_HOST, WHATSAPP_API_VERSION, resolveWhatsAppToken } from "./whatsapp.ts";

/**
 * Inbound customer media (photos, voice notes, documents) arrives as a Meta
 * reference, not as bytes: WhatsApp gives a media id that must be resolved to a
 * short-lived, token-protected URL, Instagram gives a CDN URL that expires.
 * Both are downloaded here and re-uploaded to Cloudinary so the inbox keeps a
 * permanent copy in `messages.media_urls`.
 *
 * Nothing in this module throws: media is a bonus, the customer's message is
 * not. Every failure is logged and degrades to "no media".
 */

/** Downloads are slower than Graph calls, so they get a longer leash. */
export const INBOUND_MEDIA_TIMEOUT_MS = 30_000;

/** Anything larger is skipped rather than buffered into memory. */
export const INBOUND_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

export type InboundMediaKind = "image" | "video" | "audio" | "document" | "sticker";

const WHATSAPP_MEDIA_KINDS: readonly InboundMediaKind[] = [
  "image",
  "video",
  "audio",
  "document",
  "sticker",
];

/** A WhatsApp media reference pulled out of a webhook message. */
export interface WhatsAppMediaRef {
  kind: InboundMediaKind;
  id: string;
  mimeType?: string | undefined;
  filename?: string | undefined;
}

/** One entry of Instagram's `message.attachments`. */
export interface InstagramAttachment {
  type?: string;
  payload?: { url?: string } | null;
}

export interface InboundMediaResult {
  urls: string[];
  kinds: InboundMediaKind[];
}

const EMPTY: InboundMediaResult = { urls: [], kinds: [] };

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/amr": "amr",
  "application/pdf": "pdf",
};

function extensionFor(mimeType: string | undefined): string {
  if (!mimeType) return "bin";
  const clean = mimeType.split(";")[0]!.trim().toLowerCase();
  const known = EXTENSION_BY_MIME[clean];
  if (known) return known;
  const subtype = clean.split("/")[1];
  return subtype && /^[a-z0-9]+$/.test(subtype) ? subtype : "bin";
}

function filenameFor(kind: InboundMediaKind, mimeType: string | undefined, given?: string): string {
  if (given && given.trim()) return given.trim().slice(0, 120);
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(mimeType)}`;
}

function folderFor(businessId: string): string {
  // Same convention as the dashboard upload route (routes/media.ts).
  return `knowvya/conversations/${businessId}`;
}

interface DownloadedFile {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Fetch a URL into a Buffer, refusing anything over INBOUND_MEDIA_MAX_BYTES
 * both by the declared size and while the body is read.
 */
async function downloadFile(
  url: string,
  opts: { headers?: Record<string, string>; declaredSize?: number | undefined; context: Record<string, unknown> },
): Promise<DownloadedFile | null> {
  if (typeof opts.declaredSize === "number" && opts.declaredSize > INBOUND_MEDIA_MAX_BYTES) {
    logger.warn({ ...opts.context, declaredSize: opts.declaredSize }, "Inbound media too large; skipped");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INBOUND_MEDIA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: opts.headers ?? {},
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ ...opts.context, status: res.status }, "Inbound media download failed");
      return null;
    }

    const contentLength = Number(res.headers?.get?.("content-length") ?? "");
    if (Number.isFinite(contentLength) && contentLength > INBOUND_MEDIA_MAX_BYTES) {
      logger.warn({ ...opts.context, contentLength }, "Inbound media too large; skipped");
      return null;
    }

    const mimeType = res.headers?.get?.("content-type") ?? "";

    const body = res.body as ReadableStream<Uint8Array> | null | undefined;
    if (body && typeof body.getReader === "function") {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > INBOUND_MEDIA_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          logger.warn({ ...opts.context, total }, "Inbound media exceeded the size limit mid-download; skipped");
          return null;
        }
        chunks.push(value);
      }
      return { buffer: Buffer.concat(chunks.map((c) => Buffer.from(c))), mimeType };
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > INBOUND_MEDIA_MAX_BYTES) {
      logger.warn({ ...opts.context, total: arrayBuffer.byteLength }, "Inbound media too large; skipped");
      return null;
    }
    return { buffer: Buffer.from(arrayBuffer), mimeType };
  } catch (err) {
    logger.warn({ ...opts.context, err }, "Inbound media download errored");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function storeFile(
  file: DownloadedFile,
  opts: { businessId: string; kind: InboundMediaKind; mimeType?: string | undefined; filename?: string | undefined },
): Promise<string | null> {
  if (file.buffer.length === 0) return null;
  const mimetype = opts.mimeType || file.mimeType || "application/octet-stream";
  try {
    const uploaded = await uploadBufferToCloudinary({
      buffer: file.buffer,
      filename: filenameFor(opts.kind, mimetype, opts.filename),
      mimetype,
      folder: folderFor(opts.businessId),
    });
    return uploaded.secureUrl || uploaded.url || null;
  } catch (err) {
    logger.warn({ err, kind: opts.kind }, "Could not store inbound media in Cloudinary");
    return null;
  }
}

/**
 * Pull the media reference out of a WhatsApp webhook message, if it carries one.
 * Types without a retrievable file (text, interactive, location, contacts…)
 * return null.
 */
export function extractWhatsAppMedia(msg: unknown): WhatsAppMediaRef | null {
  const m = msg as Record<string, any> | null | undefined;
  const type = typeof m?.type === "string" ? m.type : "";
  if (!WHATSAPP_MEDIA_KINDS.includes(type as InboundMediaKind)) return null;
  const payload = m?.[type];
  const id = typeof payload?.id === "string" ? payload.id : "";
  if (!id) return null;
  return {
    kind: type as InboundMediaKind,
    id,
    mimeType: typeof payload?.mime_type === "string" ? payload.mime_type : undefined,
    filename: typeof payload?.filename === "string" ? payload.filename : undefined,
  };
}

/**
 * WhatsApp media is a two-step fetch: the id resolves to a short-lived URL, and
 * that URL still needs the access token (a plain fetch returns 401).
 */
export async function fetchWhatsAppInboundMedia(opts: {
  businessId: string;
  media: WhatsAppMediaRef[];
}): Promise<InboundMediaResult> {
  if (opts.media.length === 0) return EMPTY;

  let token: string;
  try {
    token = await resolveWhatsAppToken(opts.businessId);
  } catch (err) {
    if (config.DEMO_MODE) {
      logger.info({ count: opts.media.length }, "No WhatsApp token in DEMO_MODE; inbound media skipped");
    } else {
      logger.warn({ err }, "Could not resolve a WhatsApp token for inbound media");
    }
    return EMPTY;
  }

  const authHeader = { Authorization: `Bearer ${token}` };
  const urls: string[] = [];
  const kinds: InboundMediaKind[] = [];

  for (const ref of opts.media) {
    try {
      const lookupUrl = `${WHATSAPP_API_HOST}/${WHATSAPP_API_VERSION}/${encodeURIComponent(ref.id)}`;
      const lookup = await fetch(lookupUrl, {
        headers: authHeader,
        signal: AbortSignal.timeout(INBOUND_MEDIA_TIMEOUT_MS),
      });
      if (!lookup.ok) {
        logger.warn({ mediaId: ref.id, status: lookup.status }, "WhatsApp media lookup failed");
        continue;
      }
      const meta = (await lookup.json().catch(() => null)) as
        | { url?: string; mime_type?: string; file_size?: number }
        | null;
      const downloadUrl = typeof meta?.url === "string" ? meta.url : "";
      if (!downloadUrl) {
        logger.warn({ mediaId: ref.id }, "WhatsApp media lookup returned no url");
        continue;
      }

      const file = await downloadFile(downloadUrl, {
        headers: authHeader,
        declaredSize: typeof meta?.file_size === "number" ? meta.file_size : undefined,
        context: { mediaId: ref.id, kind: ref.kind, channel: "whatsapp" },
      });
      if (!file) continue;

      const stored = await storeFile(file, {
        businessId: opts.businessId,
        kind: ref.kind,
        mimeType: ref.mimeType || meta?.mime_type,
        filename: ref.filename,
      });
      if (stored) {
        urls.push(stored);
        kinds.push(ref.kind);
      }
    } catch (err) {
      logger.warn({ err, mediaId: ref.id }, "Could not ingest WhatsApp inbound media");
    }
  }

  return { urls, kinds };
}

function instagramKind(type: string | undefined): InboundMediaKind | null {
  switch (type) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "file":
      return "document";
    // share, story_mention, template, fallback… carry no retrievable file.
    default:
      return null;
  }
}

/**
 * Instagram hands us a CDN URL that expires, so the bytes are copied to
 * Cloudinary. No auth header is needed on that URL.
 */
export async function fetchInstagramInboundMedia(opts: {
  businessId: string;
  attachments: InstagramAttachment[];
}): Promise<InboundMediaResult> {
  if (!Array.isArray(opts.attachments) || opts.attachments.length === 0) return EMPTY;

  const urls: string[] = [];
  const kinds: InboundMediaKind[] = [];

  for (const attachment of opts.attachments) {
    const kind = instagramKind(typeof attachment?.type === "string" ? attachment.type : undefined);
    if (!kind) continue;
    const sourceUrl = typeof attachment?.payload?.url === "string" ? attachment.payload.url : "";
    if (!sourceUrl) continue;

    try {
      const file = await downloadFile(sourceUrl, {
        context: { kind, channel: "instagram" },
      });
      if (!file) continue;

      const stored = await storeFile(file, { businessId: opts.businessId, kind });
      if (stored) {
        urls.push(stored);
        kinds.push(kind);
      }
    } catch (err) {
      logger.warn({ err, kind }, "Could not ingest Instagram inbound media");
    }
  }

  return { urls, kinds };
}
