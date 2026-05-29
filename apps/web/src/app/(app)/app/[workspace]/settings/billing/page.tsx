import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ success?: string }>;
}

export default async function BillingPage({ params, searchParams }: Props) {
  const { workspace: slug } = await params;
  const sp = await searchParams;
  await auth();

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const isActive = workspace.subscriptionStatus === "active";

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Facturación</h1>

      {sp.success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          ¡Suscripción activada! Ya puedes conectar tu cuenta de Instagram.
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-medium text-gray-900">Plan Starter</p>
            <p className="text-sm text-gray-500">USD 19/mes · 1 cuenta de Instagram</p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isActive
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isActive ? "Activo" : "Inactivo"}
          </span>
        </div>

        {!isActive && (
          <p className="text-sm text-gray-500">
            Configura Stripe para activar suscripciones.
          </p>
        )}
      </div>
    </div>
  );
}
