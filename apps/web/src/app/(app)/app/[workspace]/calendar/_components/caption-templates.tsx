"use client";

import { useState } from "react";
import { FileText, Trash2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  workspaceId: string;
  currentCaption: string;
  onInsert: (body: string) => void;
}

export function CaptionTemplates({ workspaceId, currentCaption, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const list = trpc.template.list.useQuery({ workspaceId }, { enabled: open });
  const utils = trpc.useUtils();
  const create = trpc.template.create.useMutation({
    onSuccess: () => utils.template.list.invalidate({ workspaceId }),
  });
  const del = trpc.template.delete.useMutation({
    onSuccess: () => utils.template.list.invalidate({ workspaceId }),
  });

  function saveCurrent() {
    if (!currentCaption.trim()) {
      alert("Escribe un caption antes de guardarlo como plantilla.");
      return;
    }
    const name = prompt("Nombre de la plantilla:");
    if (!name?.trim()) return;
    create.mutate({ workspaceId, name: name.trim(), body: currentCaption });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          Plantillas
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-gray-100 bg-white shadow-lg">
              <div className="max-h-56 overflow-y-auto py-1">
                {list.isLoading ? (
                  <p className="px-3 py-3 text-center text-xs text-gray-400">Cargando…</p>
                ) : (list.data?.length ?? 0) === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-gray-400">Sin plantillas todavía.</p>
                ) : (
                  list.data!.map((t) => (
                    <div key={t.id} className="group flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50">
                      <button
                        type="button"
                        onClick={() => { onInsert(t.body); setOpen(false); }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-xs font-medium text-gray-700 truncate">{t.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{t.body.slice(0, 48)}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => del.mutate({ id: t.id, workspaceId })}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition"
                        aria-label="Eliminar plantilla"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={saveCurrent}
        disabled={create.isPending}
        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Guardar como plantilla
      </button>
    </div>
  );
}
