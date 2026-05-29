import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { CalendarClient } from "./_components/calendar-client";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function CalendarPage({ params }: Props) {
  const { workspace: slug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: workspace.id } },
  });
  if (!membership) notFound();

  const accounts = await db.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, username: true, profilePictureUrl: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <CalendarClient
      workspaceId={workspace.id}
      workspaceSlug={slug}
      accounts={accounts}
    />
  );
}
