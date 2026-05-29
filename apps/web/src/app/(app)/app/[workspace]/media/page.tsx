import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { MediaLibrary } from "./_components/media-library";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function MediaPage({ params }: Props) {
  const { workspace: slug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: workspace.id } },
  });
  if (!membership) notFound();

  const canDelete = ["OWNER", "ADMIN"].includes(membership.role);

  return <MediaLibrary workspaceId={workspace.id} canDelete={canDelete} />;
}
