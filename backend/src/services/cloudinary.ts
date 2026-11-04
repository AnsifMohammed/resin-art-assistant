import { createHash } from "node:crypto";
import { config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { logger } from "../lib/logger.ts";

export interface CloudinaryUploadOptions {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  folder: string;
}

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  resourceType: string;
  format: string;
}

/**
 * Upload a media buffer to Cloudinary using signed upload API.
 * Uses `auto/upload` to support images, videos, and raw documents (PDFs, docs).
 */
export async function uploadBufferToCloudinary(
  opts: CloudinaryUploadOptions,
): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const ext = opts.filename.split(".").pop()?.toLowerCase() || "bin";

  if (!cloudName || !apiKey || !apiSecret) {
    if (config.DEMO_MODE) {
      logger.warn("Cloudinary credentials missing, using demo media placeholder in DEMO_MODE");
      const demoUrl = `https://res.cloudinary.com/demo/image/upload/sample.jpg`;
      return {
        url: demoUrl,
        secureUrl: demoUrl,
        resourceType: "image",
        format: ext,
      };
    }
    throw new AppError(
      503,
      "Cloudinary credentials are not configured",
      "CLOUDINARY_NOT_CONFIGURED",
    );
  }

  const timestamp = Math.round(Date.now() / 1000);
  const toSign = `folder=${opts.folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash("sha1").update(toSign).digest("hex");

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(opts.buffer)], { type: opts.mimetype || "application/octet-stream" }),
    opts.filename,
  );
  formData.append("folder", opts.folder);
  formData.append("timestamp", String(timestamp));
  formData.append("api_key", apiKey);
  formData.append("signature", signature);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      const errorMsg =
        (data?.error as { message?: string } | undefined)?.message ||
        `Cloudinary HTTP ${res.status}`;
      logger.error({ status: res.status, errorMsg, folder: opts.folder }, "Cloudinary upload failed");

      if (config.DEMO_MODE) {
        logger.warn("Falling back to demo URL because DEMO_MODE is true");
        const fallbackUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v${timestamp}/knowvya/${opts.filename}`;
        return {
          url: fallbackUrl,
          secureUrl: fallbackUrl,
          resourceType: "image",
          format: ext,
        };
      }

      throw new AppError(502, `Cloudinary upload failed: ${errorMsg}`, "CLOUDINARY_ERROR");
    }

    const secureUrl = typeof data?.secure_url === "string" ? data.secure_url : "";
    const url = typeof data?.url === "string" ? data.url : secureUrl;
    const resourceType = typeof data?.resource_type === "string" ? data.resource_type : "image";
    const format = typeof data?.format === "string" ? data.format : ext;

    if (!secureUrl) {
      throw new AppError(502, "Cloudinary returned invalid response without secure_url", "CLOUDINARY_ERROR");
    }

    return {
      url: secureUrl || url,
      secureUrl,
      resourceType,
      format,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, "Error connecting to Cloudinary");

    if (config.DEMO_MODE) {
      const fallbackUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v${timestamp}/knowvya/${opts.filename}`;
      return {
        url: fallbackUrl,
        secureUrl: fallbackUrl,
        resourceType: "image",
        format: ext,
      };
    }

    throw new AppError(
      502,
      `Failed to upload to Cloudinary: ${err instanceof Error ? err.message : String(err)}`,
      "CLOUDINARY_ERROR",
    );
  }
}
