import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-200 mb-4">404</p>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Página no encontrada</h1>
        <p className="text-sm text-gray-500 mb-6">La página que buscas no existe o fue movida.</p>
        <Link
          href="/app"
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
