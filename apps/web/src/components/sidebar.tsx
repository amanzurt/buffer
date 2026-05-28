import Link from "next/link";
import { Calendar, LayoutDashboard, Settings, Instagram } from "lucide-react";

interface SidebarProps {
  workspaceSlug: string;
  workspaceName: string;
}

export function Sidebar({ workspaceSlug, workspaceName }: SidebarProps) {
  const base = `/app/${workspaceSlug}`;
  const navItems = [
    { href: `${base}`, icon: LayoutDashboard, label: "Inicio" },
    { href: `${base}/calendar`, icon: Calendar, label: "Calendario" },
    { href: `${base}/accounts`, icon: Instagram, label: "Cuentas IG" },
    { href: `${base}/settings`, icon: Settings, label: "Configuración" },
  ];

  return (
    <aside className="w-56 min-h-screen border-r border-gray-100 bg-white flex flex-col">
      <div className="px-4 py-5 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-900 truncate block">
          {workspaceName}
        </span>
        <span className="text-xs text-gray-400">Buffer</span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
