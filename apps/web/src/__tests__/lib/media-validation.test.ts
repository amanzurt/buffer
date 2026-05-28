import { describe, it, expect } from "vitest";
import {
  getMimeCategory,
  checkImageRatio,
  feedImageSchema,
  reelSchema,
} from "@/lib/validations/media";

describe("getMimeCategory", () => {
  it("clasifica imágenes", () => {
    expect(getMimeCategory("image/jpeg")).toBe("image");
    expect(getMimeCategory("image/png")).toBe("image");
    expect(getMimeCategory("image/webp")).toBe("image");
  });
  it("clasifica videos", () => {
    expect(getMimeCategory("video/mp4")).toBe("video");
    expect(getMimeCategory("video/quicktime")).toBe("video");
  });
  it("desconocido para otros", () => {
    expect(getMimeCategory("application/pdf")).toBe("unknown");
  });
});

describe("checkImageRatio", () => {
  it("acepta ratio cuadrado 1:1", () => {
    expect(checkImageRatio(1080, 1080)).toBeNull();
  });
  it("acepta 4:5 (portrait)", () => {
    expect(checkImageRatio(1080, 1350)).toBeNull();
  });
  it("acepta 1.91:1 (landscape)", () => {
    expect(checkImageRatio(1910, 1000)).toBeNull();
  });
  it("rechaza ratio demasiado vertical", () => {
    expect(checkImageRatio(100, 500)).toBeTruthy();
  });
  it("rechaza ratio demasiado horizontal", () => {
    expect(checkImageRatio(1920, 500)).toBeTruthy();
  });
});

describe("feedImageSchema", () => {
  it("acepta imagen JPEG válida", () => {
    const result = feedImageSchema.safeParse({
      mimeType: "image/jpeg",
      sizeBytes: 2 * 1024 * 1024,
      width: 1080,
      height: 1080,
    });
    expect(result.success).toBe(true);
  });
  it("rechaza archivo demasiado grande", () => {
    const result = feedImageSchema.safeParse({
      mimeType: "image/jpeg",
      sizeBytes: 10 * 1024 * 1024,
      width: 1080,
      height: 1080,
    });
    expect(result.success).toBe(false);
  });
  it("rechaza video en lugar de imagen", () => {
    const result = feedImageSchema.safeParse({
      mimeType: "video/mp4",
      sizeBytes: 1024,
      width: 1080,
      height: 1920,
    });
    expect(result.success).toBe(false);
  });
});

describe("reelSchema", () => {
  it("acepta reel válido", () => {
    const result = reelSchema.safeParse({
      mimeType: "video/mp4",
      sizeBytes: 50 * 1024 * 1024,
      durationSeconds: 60,
      width: 1080,
      height: 1920,
    });
    expect(result.success).toBe(true);
  });
  it("rechaza reel demasiado largo", () => {
    const result = reelSchema.safeParse({
      mimeType: "video/mp4",
      sizeBytes: 10 * 1024 * 1024,
      durationSeconds: 100,
      width: 1080,
      height: 1920,
    });
    expect(result.success).toBe(false);
  });
  it("rechaza reel con ratio incorrecto", () => {
    const result = reelSchema.safeParse({
      mimeType: "video/mp4",
      sizeBytes: 10 * 1024 * 1024,
      durationSeconds: 30,
      width: 1920,
      height: 1080,
    });
    expect(result.success).toBe(false);
  });
});
