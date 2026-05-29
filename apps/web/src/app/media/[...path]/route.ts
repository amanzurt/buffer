import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Dev-only static media server. In dev the R2 mock stores uploads under
// .dev-uploads/media/...; the public URL points back here so previews work.
// In production media is served straight from the R2 public/CDN domain, so
// this route is never hit (and is disabled anyway).
const DEV_UPLOAD_DIR = path.join(process.cwd(), ".dev-uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { path: segments } = await params;
  const key = path.join("media", ...segments);
  const filePath = path.join(DEV_UPLOAD_DIR, key);

  if (!filePath.startsWith(DEV_UPLOAD_DIR)) {
    return new NextResponse("Invalid path", { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
