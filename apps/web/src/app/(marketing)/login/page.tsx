import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/app");

  const params = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Iniciar sesión
          </h1>
          <p className="text-sm text-gray-500">
            Ingresa tu email para recibir un enlace de acceso.
          </p>
        </div>

        {params.verify && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Revisa tu correo — te enviamos un enlace de acceso.
          </div>
        )}

        {params.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Hubo un error. Intenta de nuevo.
          </div>
        )}

        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("resend", formData);
          }}
        >
          <div className="space-y-3">
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="tu@email.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Enviar enlace de acceso
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
