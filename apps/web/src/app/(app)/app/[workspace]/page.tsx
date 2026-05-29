import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Instagram, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface Props {
  params: Promise<{ workspace: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Programado",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Fallido",
  CANCELED: "Cancelado",
  DRAFT: "Borrador",
};

const STATUS_DOT: Record<string, string> = {
  SCHEDULED: "bg-indigo-500",
  PUBLISHING: "bg-amber-500",
  PUBLISHED: "bg-green-500",
  FAILED: "bg-red-500",
  CANCELED: "bg-gray-400",
  DRAFT: "bg-gray-300",
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

export default async function WorkspaceDashboard({ params }: Props) {
  const { workspace: slug } = await params;
  await auth();

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [upcoming, recentPublished, stats] = await Promise.all([
    db.scheduledPost.findMany({
      where: {
        workspaceId: workspace.id,
        status: "SCHEDULED",
        scheduledAt: { gte: now, lte: in30Days },
      },
      orderBy: { scheduledAt: "asc" },
      take: 8,
      include: { igAccount: true, media: { include: { media: true }, take: 1 } },
    }),
    db.scheduledPost.findMany({
      where: { workspaceId: workspace.id, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 5,
      include: { igAccount: true, media: { include: { media: true }, take: 1 } },
    }),
    db.scheduledPost.groupBy({
      by: ["status"],
      where: {
        workspaceId: workspace.id,
        createdAt: { gte: startOfMonth },
      },
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(stats.map((s) => [s.status, s._count._all]));
  const accountCount = await db.instagramAccount.count({
    where: { workspaceId: workspace.id, status: "active" },
  });

  const publishedThisMonth = countByStatus["PUBLISHED"] ?? 0;
  const failedThisMonth = countByStatus["FAILED"] ?? 0;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{workspace.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Panel de inicio</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard icon={<Instagram className="h-4 w-4 text-pink-500" />} label="Cuentas activas" value={accountCount} />
        <StatCard icon={<Clock className="h-4 w-4 text-indigo-500" />} label="Programados" value={upcoming.length} note="próx. 30 días" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label="Publicados" value={publishedThisMonth} note="este mes" />
        <StatCard icon={<AlertCircle className="h-4 w-4 text-red-400" />} label="Fallidos" value={failedThisMonth} note="este mes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Próximas publicaciones</h2>
            <Link href={`/app/${slug}/calendar`} className="text-xs text-indigo-600 hover:underline">
              Ver calendario →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptySection
              message="No hay posts programados en los próximos 30 días."
              cta={{ href: `/app/${slug}/calendar`, label: "Ir al calendario" }}
            />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((post) => (
                <PostRow key={post.id} post={post} slug={slug} />
              ))}
            </ul>
          )}
        </section>

        {/* Recently published */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Publicados recientemente</h2>
            {recentPublished.length > 0 && (
              <span className="text-xs text-gray-400">{publishedThisMonth} este mes</span>
            )}
          </div>
          {recentPublished.length === 0 ? (
            <EmptySection message="Todavía no hay posts publicados." />
          ) : (
            <ul className="space-y-2">
              {recentPublished.map((post) => (
                <PostRow key={post.id} post={post} slug={slug} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* No accounts CTA */}
      {accountCount === 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Conecta una cuenta de Instagram para empezar a programar posts.{" "}
          <Link href={`/app/${slug}/accounts`} className="font-medium underline underline-offset-2">
            Ir a Cuentas →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  );
}

function EmptySection({ message, cta }: { message: string; cta?: { href: string; label: string } }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center">
      <p className="text-sm text-gray-400 mb-2">{message}</p>
      {cta && (
        <Link href={cta.href} className="text-xs font-medium text-indigo-600 hover:underline">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

type PostWithRelations = Awaited<ReturnType<typeof db.scheduledPost.findMany<{
  include: { igAccount: true; media: { include: { media: true }; take: 1 } };
}>>>[number];

function PostRow({ post, slug }: { post: PostWithRelations; slug: string }) {
  const thumb = post.media[0]?.media;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5">
      {thumb?.mimeType.startsWith("image/") ? (
        <img src={thumb.publicUrl} alt="" className="h-9 w-9 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm">🎬</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">
          @{post.igAccount.username}
        </p>
        <p className="text-xs text-gray-400 truncate">{post.caption.slice(0, 50)}{post.caption.length > 50 ? "…" : ""}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="flex items-center gap-1 justify-end">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[post.status] ?? "bg-gray-300"}`} />
          <span className="text-xs text-gray-500">{STATUS_LABEL[post.status] ?? post.status}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDate(post.scheduledAt ?? post.publishedAt ?? post.createdAt)}
        </p>
      </div>
    </li>
  );
}
