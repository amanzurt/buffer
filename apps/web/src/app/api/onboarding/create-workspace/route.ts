import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const formData = await req.formData();
  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    return NextResponse.redirect(new URL("/app/onboarding", req.url));
  }

  let slug = slugify(name);
  let counter = 0;
  while (await db.workspace.findUnique({ where: { slug } })) {
    slug = `${slugify(name)}-${++counter}`;
  }

  const workspace = await db.workspace.create({
    data: {
      name,
      slug,
      ownerId: session.user.id,
      memberships: {
        create: { userId: session.user.id, role: "OWNER" },
      },
    },
  });

  return NextResponse.redirect(new URL(`/app/${workspace.slug}`, req.url));
}
