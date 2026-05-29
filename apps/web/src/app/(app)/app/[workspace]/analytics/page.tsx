import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BarChart3, Eye, Heart, TrendingUp } from "lucide-react";

interface Props {
  params: Promise<{ workspace: string }>;
}

function fmt(n: number | null | undefined): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

export default async function AnalyticsPage({ params }: Props) {
  const { workspace: slug } = await params;
  await auth();

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) notFound();

  const [agg, posts] = await Promise.all([
    db.postInsight.aggregate({
      where: { post: { workspaceId: workspace.id } },
      _sum: { reach: true, likes: true, comments: true, saves: true },
      _avg: { engagement: true },
    }),
    db.scheduledPost.findMany({
      where: { workspaceId: workspace.id, status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 30,
      include: {
        insights: true,
        igAccount: { select: { username: true } },
        media: { include: { media: true }, take: 1 },
      },
    }),
  ]);

  const totalReach = agg._sum.reach ?? 0;
  const totalLikes = agg._sum.likes ?? 0;
  const avgEngagement = agg._avg.engagement ?? 0;
  const publishedCount = posts.length;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Rendimiento de tus publicaciones</p>
      </div>

      {publishedCount === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-10 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-400">Aún no hay posts publicados con métricas.</p>
          <Link href={`/app/${slug}/calendar`} className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline">
            Ir al calendario →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Stat icon={<BarChart3 className="h-4 w-4 text-indigo-500" />} label="Publicados" value={String(publishedCount)} />
            <Stat icon={<Eye className="h-4 w-4 text-sky-500" />} label="Alcance total" value={fmt(totalReach)} />
            <Stat icon={<Heart className="h-4 w-4 text-pink-500" />} label="Likes totales" value={fmt(totalLikes)} />
            <Stat icon={<TrendingUp className="h-4 w-4 text-green-500" />} label="Engagement medio" value={`${avgEngagement.toFixed(1)}%`} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Post</th>
                  <th className="px-3 py-2.5 font-medium text-right">Alcance</th>
                  <th className="px-3 py-2.5 font-medium text-right">Likes</th>
                  <th className="px-3 py-2.5 font-medium text-right">Coment.</th>
                  <th className="px-3 py-2.5 font-medium text-right">Guard.</th>
                  <th className="px-4 py-2.5 font-medium text-right">Eng.</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => {
                  const ins = p.insights;
                  const thumb = p.media[0]?.media;
                  return (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {thumb?.mimeType.startsWith("image/") ? (
                            <img src={thumb.publicUrl} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center text-xs flex-shrink-0">🎬</div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs text-gray-700 truncate max-w-[16rem]">{p.caption.slice(0, 50)}{p.caption.length > 50 ? "…" : ""}</p>
                            <p className="text-[11px] text-gray-400">@{p.igAccount.username} · {p.publishedAt ? formatDate(p.publishedAt) : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{fmt(ins?.reach)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{fmt(ins?.likes)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{fmt(ins?.comments)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{fmt(ins?.saves)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{ins?.engagement != null ? `${ins.engagement.toFixed(1)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
