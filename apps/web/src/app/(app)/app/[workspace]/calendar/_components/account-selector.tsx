"use client";

interface Account {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  status: string;
}

interface Props {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function AccountSelector({ accounts, value, onChange, disabled }: Props) {
  const active = accounts.filter((a) => a.status === "active");

  if (active.length === 0) {
    return (
      <p className="text-sm text-amber-600 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
        No hay cuentas de Instagram activas en este workspace.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">Cuenta de Instagram</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-60"
      >
        <option value="">Selecciona una cuenta…</option>
        {active.map((a) => (
          <option key={a.id} value={a.id}>
            @{a.username}
          </option>
        ))}
      </select>
    </div>
  );
}
