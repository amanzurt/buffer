"use client";

import { useMemo, useState } from "react";
import { Trash2, Search, ImageIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

function formatBytes(b: number): string {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
}

export function MediaLibrary({ workspaceId, canDelete }: { workspaceId: string; canDelete: boolean }) {
  const [query, setQuery] = useState("");
  const list = trpc.media.list.useInfiniteQuery(
    { workspaceId, take: 24 },
    { getNextPageParam: (last) => last.nextCursor },
  );
  const utils = trpc.useUtils();
  const del = trpc.media.delete.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
    onError: (e) => alert(e.message),
  });

  const assets = useMemo(
    () => (list.data?.pages ?? []).flatMap((p) => p.items),
    [list.data],
  );
  const filtered = useMemo(
    () => assets.filter((a) => a.filename.toLowerCase().includes(query.toLowerCase())),
    [assets, query],
  );

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Biblioteca</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tus archivos subidos</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-56 rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">
            {assets.length === 0 ? "Aún no has subido archivos." : "Sin resultados para tu búsqueda."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((a) => (
              <div key={a.id} className="group rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="relative aspect-square bg-gray-100">
                  {a.mimeType.startsWith("image/") ? (
                    <img src={a.publicUrl} alt={a.filename} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-900 text-3xl">🎬</div>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (confirm(`¿Borrar "${a.filename}"?`)) del.mutate({ id: a.id, workspaceId });
                      }}
                      disabled={del.isPending}
                      className="absolute right-1.5 top-1.5 rounded-md bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition disabled:opacity-50"
                      aria-label="Borrar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <p className="text-xs font-medium text-gray-700 truncate">{a.filename}</p>
                  <p className="text-[11px] text-gray-400">{formatBytes(a.sizeBytes)}</p>
                </div>
              </div>
            ))}
          </div>

          {list.hasNextPage && (
            <div className="mt-4 text-center">
              <button
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {list.isFetchingNextPage ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
