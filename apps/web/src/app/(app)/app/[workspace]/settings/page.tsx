import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { WorkspaceSettingsForm } from "./_components/workspace-settings-form";
import { MembersSection } from "./_components/members-section";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const { workspace: slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: { memberships: { where: { userId: session.user.id } } },
  });

  if (!workspace || workspace.memberships.length === 0) notFound();

  const role = workspace.memberships[0]?.role;
  const isOwner = role === "OWNER";
  const canManage = role === "OWNER" || role === "ADMIN";

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Configuración</h1>
      <p className="text-sm text-gray-500 mb-8">Ajustes del workspace</p>

      <section className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">General</h2>
        <WorkspaceSettingsForm
          workspaceId={workspace.id}
          currentName={workspace.name}
          currentSlug={workspace.slug}
          canEdit={isOwner}
        />
      </section>

      <MembersSection workspaceId={workspace.id} canManage={canManage} />

      <section className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Zona de peligro</h2>
        <p className="text-xs text-gray-500 mb-4">Estas acciones son irreversibles.</p>
        {isOwner ? (
          <button
            disabled
            className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 opacity-50 cursor-not-allowed"
          >
            Eliminar workspace (próximamente)
          </button>
        ) : (
          <p className="text-xs text-gray-400">Solo el owner puede eliminar el workspace.</p>
        )}
      </section>
    </div>
  );
}
