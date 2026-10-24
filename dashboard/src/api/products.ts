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

/** Upload image to Cloudinary */
export async function uploadToCloudinary(file: File): Promise<string> {
  try {
    const sig = await getUploadSignature();
    if (sig.configured && sig.cloudName) {
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
    }
  } catch {
    // Signed upload failed or isn't configured: fall back to the client-side preset below.
  }

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
  }

  // Fallback to data URL if Cloudinary is not yet provisioned in dev environment
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
