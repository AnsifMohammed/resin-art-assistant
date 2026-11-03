import { api } from "./client.ts";

export interface MediaUploadResponse {
  url: string;
  secureUrl: string;
  resourceType: string;
  format: string;
}

/**
 * Upload a media file (photo, video, PDF, document) to backend /upload/media,
 * which stores it securely in Cloudinary and returns a public HTTPS URL.
 */
export async function uploadMedia(file: File, signal?: AbortSignal): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return api.upload<MediaUploadResponse>("/upload/media", formData, signal);
}

