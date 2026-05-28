"use client";

import { useState } from "react";
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

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function CalendarClient({ workspaceId, workspaceSlug, accounts }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editorOpen, setEditorOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>();

  function prev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function openEditorForDay(day: number) {
    const d = new Date(year, month, day, now.getHours() + 1, 0, 0);
    if (d.getTime() < Date.now() + 5 * 60 * 1000) {
      d.setTime(Date.now() + 10 * 60 * 1000);
    }
    setDefaultDate(d);
    setEditorOpen(true);
  }

  const cells = buildMonthGrid(year, month);
  const today = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const hasActiveAccounts = accounts.some((a) => a.status === "active");

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Calendario</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {MONTH_LABELS[month]} {year}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={prev}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Mes anterior"
            >
              ←
            </button>
            <button
              onClick={next}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Mes siguiente"
            >
              →
            </button>
          </div>
          {hasActiveAccounts && (
            <button
              onClick={() => { setDefaultDate(undefined); setEditorOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              + Nuevo post
            </button>
          )}
        </div>
      </div>

      {/* No accounts banner */}
      {!hasActiveAccounts && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Conecta una cuenta de Instagram antes de programar posts.{" "}
          <a href={`/app/${workspaceSlug}/accounts`} className="font-medium underline underline-offset-2">
            Ir a Cuentas →
          </a>
        </div>
      )}

      {/* Calendar grid */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_LABELS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const isPast = day !== null && isCurrentMonth && day < today;
            const isToday = day !== null && isCurrentMonth && day === today;
            return (
              <div
                key={i}
                onClick={() => day && !isPast && hasActiveAccounts && openEditorForDay(day)}
                className={[
                  "relative min-h-[72px] border-b border-r border-gray-100 p-2 text-sm",
                  "last:border-r-0 [&:nth-child(7n)]:border-r-0",
                  day && !isPast && hasActiveAccounts ? "cursor-pointer hover:bg-indigo-50 transition-colors" : "",
                  isPast ? "bg-gray-50" : "",
                  isToday ? "bg-indigo-50" : "",
                ].join(" ")}
              >
                {day && (
                  <span
                    className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday ? "bg-indigo-600 text-white font-semibold" : "text-gray-700",
                      isPast ? "text-gray-300" : "",
                    ].join(" ")}
                  >
                    {day}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Haz click en un día para programar un post. FullCalendar con drag-and-drop llega en Plan D.
      </p>

      <PostEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        workspaceId={workspaceId}
        accounts={accounts}
        defaultDate={defaultDate}
      />
    </div>
  );
}
