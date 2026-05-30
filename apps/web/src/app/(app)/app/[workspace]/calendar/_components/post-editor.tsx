"use client";

import { useState, useEffect } from "react";
import { AccountSelector } from "./account-selector";
import { PostPreview } from "./post-preview";
import { CaptionTemplates } from "./caption-templates";
import { MediaDropzone } from "@/components/media-dropzone";
import { CaptionEditor } from "@/components/caption-editor";
import { trpc } from "@/lib/trpc/client";
import type { MediaAsset } from "@buffer/db";

interface Account {
  id: string;
  username: string;
  profilePictureUrl: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  workspaceId: string;
  accounts: Account[];
  canApprove?: boolean;
  defaultDate?: Date;
  postId?: string;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function PostEditor({ open, onClose, onSuccess, workspaceId, accounts, canApprove = false, defaultDate, postId }: Props) {
  const isEditing = !!postId;

  type PostType = "FEED_IMAGE" | "CAROUSEL" | "REEL" | "STORY";

  const [accountId, setAccountId] = useState("");
  const [postType, setPostType] = useState<PostType>("FEED_IMAGE");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [firstComment, setFirstComment] = useState("");
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const TYPE_META: Record<PostType, { label: string; accept: "image" | "video" | "any"; max: number }> = {
    FEED_IMAGE: { label: "📸 Imagen", accept: "image", max: 1 },
    CAROUSEL: { label: "🎠 Carrusel", accept: "image", max: 10 },
    REEL: { label: "🎬 Reel", accept: "video", max: 1 },
    STORY: { label: "📲 Story", accept: "any", max: 1 },
  };
  const typeMeta = TYPE_META[postType];

  const { data: existingPost } = trpc.post.get.useQuery(
    { id: postId!, workspaceId },
    { enabled: isEditing && open }
  );

  const createPost = trpc.post.create.useMutation();
  const updatePost = trpc.post.update.useMutation();
  const deletePost = trpc.post.delete.useMutation({
    onSuccess: () => { onSuccess?.(); },
    onError: (err) => { setValidationError(err.message); },
  });
  const duplicatePost = trpc.post.duplicate.useMutation({
    onSuccess: () => { onSuccess?.(); },
    onError: (err) => { setValidationError(err.message); },
  });
  const approvePost = trpc.post.approve.useMutation({
    onSuccess: () => { onSuccess?.(); },
    onError: (err) => { setValidationError(err.message); },
  });
  const rejectPost = trpc.post.reject.useMutation({
    onSuccess: () => { onSuccess?.(); },
    onError: (err) => { setValidationError(err.message); },
  });

  // Reset / pre-fill form
  useEffect(() => {
    if (!open) return;
    if (isEditing && existingPost) {
      setAccountId(existingPost.igAccountId);
      setPostType(existingPost.type as PostType);
      setCaption(existingPost.caption);
      setHashtags((existingPost.caption.match(/#\w+/g) ?? []).map((t) => t.toLowerCase()));
      setFirstComment(existingPost.firstComment ?? "");
      setScheduledAt(toLocalDatetimeValue(new Date(existingPost.scheduledAt)));
      setMedia(existingPost.media.map((m) => m.media as MediaAsset));
    } else if (!isEditing) {
      const base = defaultDate ?? new Date(Date.now() + 15 * 60 * 1000);
      setScheduledAt(toLocalDatetimeValue(base));
      setAccountId("");
      setCaption("");
      setHashtags([]);
      setFirstComment("");
      setMedia([]);
    }
    setValidationError(null);
  }, [open, isEditing, existingPost, defaultDate]);

  function validate(): string | null {
    if (!accountId) return "Selecciona una cuenta de Instagram";
    if (media.length === 0) return "Sube al menos un archivo de media";
    if (postType === "CAROUSEL" && media.length < 2)
      return "Un carrusel necesita al menos 2 imágenes";
    if (media.length > typeMeta.max)
      return `Máximo ${typeMeta.max} archivo${typeMeta.max !== 1 ? "s" : ""} para este tipo`;
    if (!caption.trim()) return "Escribe un caption";
    if (!scheduledAt) return "Selecciona una fecha y hora";
    if (new Date(scheduledAt).getTime() < Date.now() + 4 * 60 * 1000)
      return "La fecha debe ser al menos 5 minutos en el futuro";
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setValidationError(err); return; }
    setValidationError(null);

    try {
      if (isEditing && postId) {
        await updatePost.mutateAsync({
          id: postId,
          workspaceId,
          caption: caption.trim(),
          hashtags: hashtags.join(" "),
          firstComment: firstComment.trim() || undefined,
          scheduledAt: new Date(scheduledAt).toISOString(),
          mediaIds: media.length > 0 ? media.map((m) => m.id) : undefined,
        });
      } else {
        await createPost.mutateAsync({
          workspaceId,
          igAccountId: accountId,
          type: postType,
          caption: caption.trim(),
          hashtags: hashtags.join(" "),
          firstComment: firstComment.trim() || undefined,
          scheduledAt: new Date(scheduledAt).toISOString(),
          mediaIds: media.map((m) => m.id),
        });
      }
      onSuccess?.();
    } catch (err: any) {
      setValidationError(err.message ?? "Error al guardar el post");
    }
  }

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isPending = createPost.isPending || updatePost.isPending || deletePost.isPending || duplicatePost.isPending || approvePost.isPending || rejectPost.isPending;
  const isPendingApproval = isEditing && existingPost?.status === "PENDING_APPROVAL";
  const canDelete = isEditing && existingPost &&
    ["DRAFT", "SCHEDULED", "FAILED", "CANCELED"].includes(existingPost.status);
  const minDatetime = toLocalDatetimeValue(new Date(Date.now() + 5 * 60 * 1000));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isEditing ? "Editar post" : "Nuevo post"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Vista previa */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Vista previa</label>
            <PostPreview
              username={selectedAccount?.username ?? ""}
              avatarUrl={selectedAccount?.profilePictureUrl}
              media={media}
              caption={caption}
              type={postType}
            />
          </div>

          {/* Tipo */}
          {!isEditing && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Tipo</label>
              <div className="flex flex-wrap gap-2">
                {(["FEED_IMAGE", "CAROUSEL", "REEL", "STORY"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setPostType(t); setMedia([]); }}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      postType === t
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300",
                    ].join(" ")}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cuenta */}
          <AccountSelector accounts={accounts} value={accountId} onChange={setAccountId} disabled={isEditing} />

          {/* Media */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">
              Media
              {postType === "CAROUSEL" && (
                <span className="ml-1 text-gray-400">({media.length}/{typeMeta.max} · mín. 2)</span>
              )}
            </label>

            {media.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                {m.mimeType.startsWith("image/") ? (
                  <img src={m.publicUrl} alt={m.filename} className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200 text-lg">🎬</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {postType === "CAROUSEL" && <span className="text-gray-400">{i + 1}. </span>}
                    {m.filename}
                  </p>
                  <p className="text-xs text-gray-400">{(m.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  onClick={() => setMedia((prev) => prev.filter((x) => x.id !== m.id))}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Quitar
                </button>
              </div>
            ))}

            {media.length < typeMeta.max && (
              <MediaDropzone
                workspaceId={workspaceId}
                accept={typeMeta.accept}
                onUpload={(asset) => setMedia((prev) => [...prev, asset])}
              />
            )}
          </div>

          {/* Caption */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-gray-600">Caption</label>
              <CaptionTemplates workspaceId={workspaceId} currentCaption={caption} onInsert={setCaption} />
            </div>
            <CaptionEditor value={caption} onChange={setCaption} onHashtagsChange={setHashtags} />
            {hashtags.length > 0 && (
              <p className="text-xs text-gray-400">{hashtags.length} hashtag{hashtags.length !== 1 ? "s" : ""}</p>
            )}
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Programar para</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={minDatetime}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* Primer comentario */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">
              Primer comentario <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={firstComment}
              onChange={(e) => setFirstComment(e.target.value)}
              maxLength={2200}
              rows={3}
              placeholder="Hashtags extra, CTA, etc."
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {validationError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {validationError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-2">
          {isPendingApproval && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
              <p className="text-xs font-medium text-purple-800">⏳ Pendiente de aprobación</p>
              {canApprove ? (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => approvePost.mutate({ id: postId!, workspaceId })}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
                  >
                    Aprobar y programar
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt("Motivo del rechazo (opcional):") ?? undefined;
                      rejectPost.mutate({ id: postId!, workspaceId, reason });
                    }}
                    disabled={isPending}
                    className="flex-1 rounded-lg border border-red-200 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Rechazar
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs text-purple-600">Un aprobador debe revisarlo antes de programarse.</p>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {isPending ? "Guardando…" : isEditing ? "Guardar cambios" : "Programar post"}
            </button>
          </div>
          {isEditing && existingPost && (
            <button
              onClick={() => duplicatePost.mutate({ id: postId!, workspaceId })}
              disabled={isPending}
              className="w-full rounded-lg py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              Duplicar post (+1 día)
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (confirm("¿Eliminar este post? Esta acción no se puede deshacer.")) {
                  deletePost.mutate({ id: postId!, workspaceId });
                }
              }}
              disabled={isPending}
              className="w-full rounded-lg py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              Eliminar post
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
