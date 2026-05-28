"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

interface Props {
  workspaceId: string;
  currentName: string;
  currentSlug: string;
  canEdit: boolean;
}

export function WorkspaceSettingsForm({ workspaceId, currentName, currentSlug, canEdit }: Props) {
  const [name, setName] = useState(currentName);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const updateWorkspace = trpc.workspace.update.useMutation({
    onSuccess: (data) => {
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 2000);
      if (data.slug !== currentSlug) {
        router.push(`/app/${data.slug}/settings`);
      } else {
        router.refresh();
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === currentName) return;
    updateWorkspace.mutate({ workspaceId, name: name.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del workspace</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          maxLength={64}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Slug (URL)</label>
        <input
          type="text"
          value={currentSlug}
          disabled
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-400 bg-gray-50"
        />
        <p className="text-xs text-gray-400 mt-1">El slug se actualiza automáticamente al cambiar el nombre.</p>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {canEdit && (
        <button
          type="submit"
          disabled={updateWorkspace.isPending || name === currentName || !name.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {updateWorkspace.isPending ? "Guardando…" : saved ? "✓ Guardado" : "Guardar cambios"}
        </button>
      )}
    </form>
  );
}
