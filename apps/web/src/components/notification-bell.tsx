"use client";

import { useState } from "react";
import { Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

function timeAgo(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return `hace ${days} d`;
}

export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);

  const unread = trpc.notification.unreadCount.useQuery(
    { workspaceId },
    { refetchInterval: 15000, refetchOnWindowFocus: true },
  );
  const list = trpc.notification.list.useQuery(
    { workspaceId, limit: 20 },
    { enabled: open },
  );
  const utils = trpc.useUtils();
  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate({ workspaceId });
      utils.notification.list.invalidate({ workspaceId });
    },
  });

  const count = unread.data ?? 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && count > 0) markAllRead.mutate({ workspaceId });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificaciones"
        className="relative flex items-center justify-center h-8 w-8 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-gray-100 bg-white shadow-lg">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-700">Notificaciones</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {list.isLoading ? (
                <p className="px-3 py-6 text-center text-xs text-gray-400">Cargando…</p>
              ) : (list.data?.length ?? 0) === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-gray-400">Sin notificaciones todavía.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {list.data!.map((n) => (
                    <li key={n.id} className="flex gap-2.5 px-3 py-2.5">
                      {n.type === "post_published" ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{n.title}</p>
                        {n.body && <p className="text-xs text-gray-400 truncate">{n.body}</p>}
                        <p className="text-[10px] text-gray-300 mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
