"use client";

import { useState, useEffect } from "react";
import { AccountSelector } from "./account-selector";
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

export function PostEditor({ open, onClose, onSuccess, workspaceId, accounts, defaultDate, postId }: Props) {
  const isEditing = !!postId;

  const [accountId, setAccountId] = useState("");
  const [postType, setPostType] = useState<"FEED_IMAGE" | "REEL">("FEED_IMAGE");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [firstComment, setFirstComment] = useState("");
  const [media, setMedia] = useState<MediaAsset | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: existingPost } = trpc.post.get.useQuery(
    { id: postId!, workspaceId },
    { enabled: isEditing && open }
  );

  const createPost = trpc.post.create.useMutation();
  const updatePost = trpc.post.update.useMutation();

  // Reset / pre-fill form
  useEffect(() => {
    if (!open) return;
    if (isEditing && existingPost) {
      setAccountId(existingPost.igAccountId);
      setPostType(existingPost.type as "FEED_IMAGE" | "REEL");
      setCaption(existingPost.caption);
      setHashtags((existingPost.caption.match(/#\w+/g) ?? []).map((t) => t.toLowerCase()));
      setFirstComment(existingPost.firstComment ?? "");
      setScheduledAt(toLocalDatetimeValue(new Date(existingPost.scheduledAt)));
      const firstMedia = existingPost.media[0]?.media as MediaAsset | undefined;
      setMedia(firstMedia ?? null);
    } else if (!isEditing) {
      const base = defaultDate ?? new Date(Date.now() + 15 * 60 * 1000);
      setScheduledAt(toLocalDatetimeValue(base));
      setAccountId("");
      setCaption("");
      setHashtags([]);
      setFirstComment("");
      setMedia(null);
    }
    setValidationError(null);
  }, [open, isEditing, existingPost, defaultDate]);

  function validate(): string | null {
    if (!accountId) return "Selecciona una cuenta de Instagram";
    if (!media) return "Sube un archivo de media";
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
          mediaIds: media ? [media.id] : undefined,
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
          mediaIds: media ? [media.id] : [],
        });
      }
      onSuccess?.();
    } catch (err: any) {
      setValidationError(err.message ?? "Error al guardar el post");
    }
  }

  const isPending = createPost.isPending || updatePost.isPending;
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
          {/* Tipo */}
          {!isEditing && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Tipo</label>
              <div className="flex gap-2">
                {(["FEED_IMAGE", "REEL"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPostType(t)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      postType === t
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300",
                    ].join(" ")}
                  >
                    {t === "FEED_IMAGE" ? "📸 Imagen" : "🎬 Reel"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cuenta */}
          <AccountSelector accounts={accounts} value={accountId} onChange={setAccountId} disabled={isEditing} />

          {/* Media */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Media</label>
            {media ? (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                {media.mimeType.startsWith("image/") ? (
                  <img src={media.publicUrl} alt={media.filename} className="h-10 w-10 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200 text-lg">🎬</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{media.filename}</p>
                  <p className="text-xs text-gray-400">{(media.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button onClick={() => setMedia(null)} className="text-xs text-red-500 hover:text-red-700">Quitar</button>
              </div>
            ) : (
              <MediaDropzone
                workspaceId={workspaceId}
                accept={postType === "REEL" ? "video" : "image"}
                onUpload={setMedia}
              />
            )}
          </div>

          {/* Caption */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Caption</label>
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
        <div className="border-t border-gray-100 px-5 py-4 flex gap-3">
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
      </aside>
    </div>
  );
}
