import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ConnectInstagramButton } from "@/components/connect-instagram-button";

interface Props {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    expired: "bg-red-100 text-red-800",
    revoked: "bg-gray-100 text-gray-600",
    error: "bg-yellow-100 text-yellow-800",
  };
  const labels: Record<string, string> = {
    active: "Activo",
    expired: "Expirado",
    revoked: "Revocado",
    error: "Error",
  };
  const cls = styles[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

function tokenExpiryLabel(expiresAt: Date): string {
  const days = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expirado";
  if (days <= 7) return `Expira en ${days}d`;
  return `Válido ${days}d`;
}

export default async function AccountsPage({ params, searchParams }: Props) {
  const { workspace: slug } = await params;
  const { success, error } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const membership = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: session.user.id, workspaceId: workspace.id } },
  });
  const canConnect = membership && ["OWNER", "ADMIN"].includes(membership.role);

  const accounts = await db.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cuentas de Instagram</h1>
          <p className="text-sm text-gray-500 mt-1">Conecta cuentas Business o Creator para programar publicaciones.</p>
        </div>
        {canConnect && <ConnectInstagramButton workspaceId={workspace.id} />}
      </div>

      {success === "connected" && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          Cuenta conectada correctamente.
        </div>
      )}
      {error === "no_business_accounts" && (
        <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
          No se encontraron cuentas Business o Creator en ese perfil de Facebook.
        </div>
      )}
      {error && error !== "no_business_accounts" && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          Hubo un error al conectar: <code className="font-mono">{error}</code>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900">Sin cuentas conectadas</p>
          <p className="mt-1 text-sm text-gray-500">
            {canConnect ? "Haz clic en \"Conectar Instagram\" para comenzar." : "Pide al owner del workspace que conecte una cuenta."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-4 p-4">
              {account.profilePictureUrl ? (
                <img
                  src={account.profilePictureUrl}
                  alt={account.username}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-500 text-sm font-semibold">
                  {account.username.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">@{account.username}</p>
                <p className="text-xs text-gray-500 truncate">{account.facebookPageName ?? "Página de Facebook"}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-400">
                  {tokenExpiryLabel(new Date(account.tokenExpiresAt))}
                </span>
                <StatusBadge status={account.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
