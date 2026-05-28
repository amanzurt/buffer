import { NextRequest, NextResponse } from "next/server";

// Dev-only upload mock endpoint. Accepts any PUT and returns 200 so the
// MediaDropzone XHR succeeds without real R2 credentials.
export async function PUT(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  // Drain the body so the connection closes cleanly
  await req.arrayBuffer();
  return new NextResponse(null, { status: 200 });
}
