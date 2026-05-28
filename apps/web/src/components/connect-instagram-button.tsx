"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

interface Props {
  workspaceId: string;
}

export function ConnectInstagramButton({ workspaceId }: Props) {
  const [loading, setLoading] = useState(false);
  const getOAuthUrl = trpc.instagram.getOAuthUrl.useMutation();

  async function handleConnect() {
    setLoading(true);
    try {
      const { url } = await getOAuthUrl.mutateAsync({ workspaceId });
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
    >
      {loading ? "Redirigiendo..." : "Conectar Instagram"}
    </button>
  );
}
