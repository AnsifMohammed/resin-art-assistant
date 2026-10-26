import { api } from "./client.ts";
import type {
  CreateProductRequest,
  ProductResponse,
  ProductsResponse,
  UpdateProductRequest,
  UploadSignatureResponse,
} from "../types/index.ts";

export interface ProductsQuery {
  active?: "true" | "false" | "all";
}

/** GET /products */
export const getProducts = (query?: ProductsQuery, signal?: AbortSignal) =>
  api.get<ProductsResponse>("/products", query, signal);

/** GET /products/:id */
export const getProduct = (id: string, signal?: AbortSignal) =>
  api.get<ProductResponse>(`/products/${id}`, undefined, signal);

/** POST /products (admin only) */
export const createProduct = (data: CreateProductRequest) =>
  api.post<ProductResponse>("/products", data);

/** PUT /products/:id (admin only) */
export const updateProduct = (id: string, data: UpdateProductRequest) =>
  api.put<ProductResponse>(`/products/${id}`, data);

/** DELETE /products/:id (admin only, soft delete) */
export const deleteProduct = (id: string) =>
  api.delete<{ ok: boolean; product: ProductResponse["product"] }>(`/products/${id}`);

/** POST /products/upload-signature (admin only) */
export const getUploadSignature = () =>
  api.post<UploadSignatureResponse>("/products/upload-signature");

/**
 * Build Cloudinary optimized thumbnail URL with auto format and quality.
 * If not a Cloudinary URL, returns the original URL.
 */
export function getCloudinaryThumb(url?: string | null, width = 400, height = 300): string {
  if (!url) return "";
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    if (!url.includes("/upload/f_auto")) {
      return url.replace("/upload/", `/upload/f_auto,q_auto,c_fill,g_auto,w_${width},h_${height}/`);
    }
  }
  return url;
}

/** Upload image directly to Cloudinary */
export async function uploadToCloudinary(file: File): Promise<string> {
  let sig: UploadSignatureResponse | null = null;
  try {
    sig = await getUploadSignature();
  } catch (err) {
    console.warn("Could not retrieve Cloudinary upload signature from backend:", err);
  }

  // 1. Backend signed or configured upload
  if (sig && sig.configured && sig.cloudName) {
    const formData = new FormData();
    formData.append("file", file);
    if (sig.signature && sig.apiKey && sig.timestamp) {
      formData.append("api_key", sig.apiKey);
      formData.append("timestamp", String(sig.timestamp));
      formData.append("signature", sig.signature);
      if (sig.folder) formData.append("folder", sig.folder);
    } else if (sig.uploadPreset) {
      formData.append("upload_preset", sig.uploadPreset);
    }

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
      { method: "POST", body: formData },
    );
    if (res.ok) {
      const json = await res.json();
      return json.secure_url;
    }
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);
  }

  // 2. Client-side Vite env fallback
  const clientCloudName = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_CLOUDINARY_CLOUD_NAME;
  const clientPreset = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (clientCloudName && clientPreset) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", clientPreset);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${clientCloudName}/image/upload`,
      { method: "POST", body: formData },
    );
    if (res.ok) {
      const json = await res.json();
      return json.secure_url;
    }
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);
  }

  throw new Error(
    "Cloudinary is not configured. Please ensure CLOUDINARY_CLOUD_NAME and credentials are set in backend .env"
  );
}
