import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Dev-only upload mock. Persists the PUT body to a local folder so the
// uploaded media is actually viewable in dev (served by /media/[...path]).
// In production real R2 presigned URLs are used and this route is disabled.
const DEV_UPLOAD_DIR = path.join(process.cwd(), ".dev-uploads");

export async function PUT(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const key = req.nextUrl.searchParams.get("key");
  const body = Buffer.from(await req.arrayBuffer());

  if (!key) {
    // No key → just drain and succeed (keeps old behaviour).
    return new NextResponse(null, { status: 200 });
  }

  try {
    // The key is server-generated (media/<ws>/<uuid>.ext). Normalize and
    // confine to DEV_UPLOAD_DIR to guard against path traversal.
    const dest = path.join(DEV_UPLOAD_DIR, key);
    if (!dest.startsWith(DEV_UPLOAD_DIR)) {
      return new NextResponse("Invalid key", { status: 400 });
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  } catch {
    // Non-fatal in dev — the upload still "succeeds" so the UI flow continues.
  }

  return new NextResponse(null, { status: 200 });
}
