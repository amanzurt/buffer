"use client";

import { useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { EventDropArg, EventClickArg, EventInput } from "@fullcalendar/core";
import { trpc } from "@/lib/trpc/client";
import { PostEditor } from "./post-editor";

interface Account {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  status: string;
}

interface Props {
  workspaceId: string;
  workspaceSlug: string;
  accounts: Account[];
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#6366f1",   // indigo
  PUBLISHING: "#f59e0b",  // amber
  PUBLISHED: "#22c55e",   // green
  FAILED: "#ef4444",      // red
  CANCELED: "#9ca3af",    // gray
  DRAFT: "#d1d5db",
};

export function CalendarClient({ workspaceId, workspaceSlug, accounts }: Props) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editPostId, setEditPostId] = useState<string | undefined>();
  const [defaultDate, setDefaultDate] = useState<Date | undefined>();
  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString(),
    };
  });

  const { data: posts, refetch } = trpc.post.list.useQuery(
    { workspaceId, from: range.from, to: range.to },
    { refetchInterval: 30_000 }
  );

  const updatePost = trpc.post.update.useMutation({
    onSuccess: () => { refetch(); },
  });

  const events: EventInput[] = (posts ?? []).map((p) => ({
    id: p.id,
    title: `@${p.igAccount?.username ?? "?"} · ${p.caption.slice(0, 30)}${p.caption.length > 30 ? "…" : ""}`,
    start: p.scheduledAt,
    backgroundColor: STATUS_COLORS[p.status] ?? "#6366f1",
    borderColor: STATUS_COLORS[p.status] ?? "#6366f1",
    textColor: "#fff",
    extendedProps: { status: p.status },
  }));

  const handleDateClick = useCallback((arg: DateClickArg) => {
    const d = arg.date;
    if (d.getTime() < Date.now() - 60_000) return;
    d.setHours(new Date().getHours() + 1, 0, 0, 0);
    if (d.getTime() < Date.now() + 5 * 60_000) d.setTime(Date.now() + 10 * 60_000);
    setEditPostId(undefined);
    setDefaultDate(d);
    setEditorOpen(true);
  }, []);

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const status = arg.event.extendedProps?.status;
    if (["PUBLISHED", "PUBLISHING"].includes(status)) return;
    setEditPostId(arg.event.id);
    setDefaultDate(undefined);
    setEditorOpen(true);
  }, []);

  const handleEventDrop = useCallback(async (arg: EventDropArg) => {
    const newDate = arg.event.start;
    if (!newDate || newDate.getTime() < Date.now() + 4 * 60_000) {
      arg.revert();
      return;
    }
    try {
      await updatePost.mutateAsync({
        id: arg.event.id,
        workspaceId,
        scheduledAt: newDate.toISOString(),
      });
    } catch {
      arg.revert();
    }
  }, [updatePost, workspaceId]);

  const hasActiveAccounts = accounts.some((a) => a.status === "active");

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Calendario</h1>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
            {Object.entries(STATUS_COLORS).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
          {hasActiveAccounts && (
            <button
              onClick={() => { setEditPostId(undefined); setDefaultDate(undefined); setEditorOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              + Nuevo post
            </button>
          )}
        </div>
      </div>

      {!hasActiveAccounts && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Conecta una cuenta de Instagram antes de programar posts.{" "}
          <a href={`/app/${workspaceSlug}/accounts`} className="font-medium underline underline-offset-2">
            Ir a Cuentas →
          </a>
        </div>
      )}

      {/* FullCalendar */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden fc-buffer">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="es"
          firstDay={1}
          height="auto"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          events={events}
          editable={hasActiveAccounts}
          droppable={false}
          selectable={false}
          dateClick={hasActiveAccounts ? handleDateClick : undefined}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          datesSet={(arg) => {
            setRange({
              from: arg.startStr,
              to: arg.endStr,
            });
          }}
          eventDisplay="block"
          dayMaxEvents={3}
          moreLinkText={(n) => `+${n} más`}
          noEventsText="Sin posts este período"
          buttonText={{ today: "Hoy" }}
        />
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Arrastra un post para reprogramarlo. Click en un día vacío para crear uno nuevo.
      </p>

      <PostEditor
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditPostId(undefined); }}
        workspaceId={workspaceId}
        accounts={accounts}
        defaultDate={defaultDate}
        postId={editPostId}
        onSuccess={() => { refetch(); setEditorOpen(false); setEditPostId(undefined); }}
      />
    </div>
  );
}
