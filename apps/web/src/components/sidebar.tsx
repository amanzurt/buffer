"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, LayoutDashboard, Settings, Instagram, LogOut, BarChart3, Images } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";

interface SidebarProps {
  workspaceSlug: string;
  workspaceName: string;
  workspaceId: string;
}

export function Sidebar({ workspaceSlug, workspaceName, workspaceId }: SidebarProps) {
  const base = `/app/${workspaceSlug}`;
  const pathname = usePathname();

  const navItems = [
    { href: base, icon: LayoutDashboard, label: "Inicio", exact: true },
    { href: `${base}/calendar`, icon: Calendar, label: "Calendario" },
    { href: `${base}/analytics`, icon: BarChart3, label: "Analytics" },
    { href: `${base}/media`, icon: Images, label: "Biblioteca" },
    { href: `${base}/accounts`, icon: Instagram, label: "Cuentas IG" },
    { href: `${base}/settings`, icon: Settings, label: "Configuración" },
  ];

  return (
    <aside className="w-56 min-h-screen border-r border-gray-100 bg-white flex flex-col">
      <div className="px-4 py-5 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold text-sm text-gray-900 truncate block">
            {workspaceName}
          </span>
          <span className="text-xs text-gray-400">Buffer</span>
        </div>
        <NotificationBell workspaceId={workspaceId} />
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              ].join(" ")}
            >
              <Icon className={["h-4 w-4 flex-shrink-0", active ? "text-indigo-600" : ""].join(" ")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-2 py-3 border-t border-gray-100">
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
