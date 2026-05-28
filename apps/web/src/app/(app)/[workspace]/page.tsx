import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspaceDashboard({ params }: Props) {
  const { workspace: slug } = await params;
  await auth();

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: { _count: { select: { posts: true, igAccounts: true } } },
  });
  if (!workspace) notFound();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">
        {workspace.name}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {workspace._count.posts} posts · {workspace._count.igAccounts} cuentas IG
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <p className="text-gray-400 text-sm mb-4">
          Tu calendario aparecerá aquí. Empieza conectando una cuenta de Instagram.
        </p>
        <Link
          href={`/app/${slug}/accounts`}
          className="inline-block bg-gray-900 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
        >
          Conectar Instagram
        </Link>
      </div>
    </div>
  );
}
