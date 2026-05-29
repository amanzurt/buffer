import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

interface Props {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace: slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: { memberships: { where: { userId: session.user.id } } },
  });

  if (!workspace || workspace.memberships.length === 0) notFound();

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceSlug={slug} workspaceName={workspace.name} workspaceId={workspace.id} />
      <main className="flex-1 bg-gray-50">{children}</main>
    </div>
  );
}
