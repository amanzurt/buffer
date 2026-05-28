import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 8 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;  // 100 MB
export const MAX_REEL_SECONDS = 90;

// Ratio bounds for IG feed (4:5 portrait → 1.91:1 landscape)
const MIN_RATIO = 4 / 5;  // 0.8
const MAX_RATIO = 1.91;

export function getMimeCategory(mimeType: string): "image" | "video" | "unknown" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "unknown";
}

export function checkImageRatio(width: number, height: number): string | null {
  const ratio = width / height;
  if (ratio < MIN_RATIO - 0.01) return `Ratio demasiado vertical (mín 4:5)`;
  if (ratio > MAX_RATIO + 0.01) return `Ratio demasiado horizontal (máx 1.91:1)`;
  return null;
}

export function checkReelRatio(width: number, height: number): string | null {
  const ratio = width / height;
  const target = 9 / 16; // 0.5625
  if (Math.abs(ratio - target) > 0.05) return `Los Reels deben ser 9:16 vertical`;
  return null;
}

export const feedImageSchema = z.object({
  mimeType: z.enum(ALLOWED_IMAGE_TYPES, {
    errorMap: () => ({ message: "Solo JPEG, PNG o WEBP" }),
  }),
  sizeBytes: z.number().max(MAX_IMAGE_BYTES, `Máximo ${MAX_IMAGE_BYTES / 1024 / 1024} MB`),
  width: z.number().positive(),
  height: z.number().positive(),
}).refine(
  ({ width, height }) => checkImageRatio(width, height) === null,
  ({ width, height }) => ({ message: checkImageRatio(width, height) ?? "Ratio inválido" })
);

export const reelSchema = z.object({
  mimeType: z.enum(ALLOWED_VIDEO_TYPES, {
    errorMap: () => ({ message: "Solo MP4 o MOV" }),
  }),
  sizeBytes: z.number().max(MAX_VIDEO_BYTES, `Máximo ${MAX_VIDEO_BYTES / 1024 / 1024} MB`),
  durationSeconds: z.number().max(MAX_REEL_SECONDS, `Máximo ${MAX_REEL_SECONDS} segundos`),
  width: z.number().positive(),
  height: z.number().positive(),
}).refine(
  ({ width, height }) => checkReelRatio(width, height) === null,
  ({ width, height }) => ({ message: checkReelRatio(width, height) ?? "Ratio inválido" })
);

export const carouselItemSchema = feedImageSchema;

export type FeedImageInput = z.infer<typeof feedImageSchema>;
export type ReelInput = z.infer<typeof reelSchema>;
