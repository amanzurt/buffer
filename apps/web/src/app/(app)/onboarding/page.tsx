import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          Crea tu workspace
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Un workspace es tu marca, agencia o cliente.
        </p>
        <form action="/api/onboarding/create-workspace" method="POST">
          <div className="space-y-3">
            <input
              type="text"
              name="name"
              required
              placeholder="Mi Agencia"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Crear workspace
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
