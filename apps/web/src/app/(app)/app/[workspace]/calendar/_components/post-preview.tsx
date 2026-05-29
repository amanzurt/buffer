"use client";

import { Heart, MessageCircle, Send, Bookmark } from "lucide-react";
import type { MediaAsset } from "@buffer/db";

interface Props {
  username: string;
  avatarUrl?: string | null;
  media: MediaAsset[];
  caption: string;
  type: "FEED_IMAGE" | "CAROUSEL" | "REEL" | "STORY";
}

// Live Instagram-style preview of the post being composed.
export function PostPreview({ username, avatarUrl, media, caption, type }: Props) {
  const isStoryOrReel = type === "STORY" || type === "REEL";
  const first = media[0];
  const aspect = isStoryOrReel ? "aspect-[9/16]" : "aspect-square";

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600" />
        )}
        <span className="font-semibold text-gray-900 text-xs">{username || "tu_cuenta"}</span>
        <span className="ml-auto text-gray-400">•••</span>
      </div>

      {/* Media */}
      <div className={`relative w-full ${aspect} bg-gray-100`}>
        {first ? (
          first.mimeType.startsWith("image/") ? (
            <img src={first.publicUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-900 text-3xl">🎬</div>
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300 text-xs">
            Sin media
          </div>
        )}

        {type === "CAROUSEL" && media.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              1/{media.length}
            </span>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {media.slice(0, 8).map((m, i) => (
                <span key={m.id} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-indigo-500" : "bg-white/70"}`} />
              ))}
            </div>
          </>
        )}

        {isStoryOrReel && (
          <span className="absolute left-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {type === "REEL" ? "Reel" : "Story"}
          </span>
        )}
      </div>

      {/* Actions (Story hides the feed chrome) */}
      {type !== "STORY" && (
        <>
          <div className="flex items-center gap-3 px-3 pt-2 text-gray-700">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Send className="h-5 w-5" />
            <Bookmark className="ml-auto h-5 w-5" />
          </div>
          <div className="px-3 pb-3 pt-1.5">
            <p className="text-xs text-gray-800 line-clamp-3">
              <span className="font-semibold">{username || "tu_cuenta"}</span>{" "}
              {caption || <span className="text-gray-400">Tu caption aparecerá aquí…</span>}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
