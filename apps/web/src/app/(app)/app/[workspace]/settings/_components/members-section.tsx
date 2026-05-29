"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

const ROLES = ["ADMIN", "EDITOR", "APPROVER", "CLIENT"] as const;
const ROLE_LABEL: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Admin",
  EDITOR: "Editor",
  APPROVER: "Aprobador",
  CLIENT: "Cliente",
};

export function MembersSection({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("EDITOR");
  const [error, setError] = useState<string | null>(null);

  const list = trpc.member.list.useQuery({ workspaceId });
  const utils = trpc.useUtils();
  const refresh = () => utils.member.list.invalidate({ workspaceId });

  const add = trpc.member.add.useMutation({ onSuccess: () => { setEmail(""); setError(null); refresh(); }, onError: (e) => setError(e.message) });
  const updateRole = trpc.member.updateRole.useMutation({ onSuccess: refresh, onError: (e) => setError(e.message) });
  const remove = trpc.member.remove.useMutation({ onSuccess: refresh, onError: (e) => setError(e.message) });

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Miembros</h2>

      <ul className="space-y-2 mb-4">
        {(list.data ?? []).map((m) => (
          <li key={m.membershipId} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 truncate">{m.email}</p>
              {m.name && <p className="text-xs text-gray-400 truncate">{m.name}</p>}
            </div>
            {canManage && m.role !== "OWNER" ? (
              <select
                value={m.role}
                onChange={(e) => updateRole.mutate({ workspaceId, membershipId: m.membershipId, role: e.target.value as (typeof ROLES)[number] })}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none"
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{ROLE_LABEL[m.role] ?? m.role}</span>
            )}
            {canManage && m.role !== "OWNER" && (
              <button
                onClick={() => { if (confirm(`¿Quitar a ${m.email}?`)) remove.mutate({ workspaceId, membershipId: m.membershipId }); }}
                disabled={remove.isPending}
                className="text-gray-300 hover:text-red-500 transition disabled:opacity-50"
                aria-label="Quitar miembro"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage ? (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-600 mb-2">Invitar miembro</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
              className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-700 focus:border-indigo-400 focus:outline-none"
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button
              onClick={() => { if (email.trim()) add.mutate({ workspaceId, email, role }); }}
              disabled={add.isPending || !email.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invitar
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">El invitado accede iniciando sesión con su email (magic link).</p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Solo OWNER/ADMIN pueden gestionar miembros.</p>
      )}
    </section>
  );
}
