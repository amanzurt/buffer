import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AppIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) redirect("/app/onboarding");

  redirect(`/app/${membership.workspace.slug}`);
}
