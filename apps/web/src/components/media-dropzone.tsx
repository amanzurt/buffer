"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { trpc } from "@/lib/trpc/client";
import { getMimeCategory, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/validations/media";
import type { MediaAsset } from "@buffer/db";

type AcceptMode = "image" | "video" | "any";

interface Props {
  workspaceId: string;
  accept?: AcceptMode;
  onUpload: (asset: MediaAsset) => void;
  disabled?: boolean;
}

const ACCEPT_MAP: Record<AcceptMode, Record<string, string[]>> = {
  image: { "image/jpeg": [], "image/png": [], "image/webp": [] },
  video: { "video/mp4": [], "video/quicktime": [] },
  any: { "image/jpeg": [], "image/png": [], "image/webp": [], "video/mp4": [], "video/quicktime": [] },
};

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

export function MediaDropzone({ workspaceId, accept = "any", onUpload, disabled }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getUploadUrl = trpc.media.getUploadUrl.useMutation();
  const finalizeUpload = trpc.media.finalizeUpload.useMutation();

  const uploadFile = useCallback(async (file: File) => {
    setError(null);
    setProgress(0);

    const maxBytes = getMimeCategory(file.type) === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      setError(`Archivo demasiado grande (máx ${formatBytes(maxBytes)})`);
      return;
    }

    try {
      const { uploadUrl, key, publicUrl } = await getUploadUrl.mutateAsync({
        workspaceId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        });
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      // Get image dimensions if applicable
      let width: number | undefined;
      let height: number | undefined;
      if (getMimeCategory(file.type) === "image") {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
      }

      const asset = await finalizeUpload.mutateAsync({
        workspaceId,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        r2Key: key,
        publicUrl,
        width,
        height,
      });

      setProgress(null);
      onUpload(asset);
    } catch (err: any) {
      setProgress(null);
      setError(err.message ?? "Error al subir el archivo");
    }
  }, [workspaceId, getUploadUrl, finalizeUpload, onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT_MAP[accept],
    maxFiles: 1,
    disabled: disabled || progress !== null,
    onDropAccepted: ([file]) => { if (file) uploadFile(file); },
    onDropRejected: ([rej]) => {
      const msg = rej?.errors[0]?.message ?? "Archivo no aceptado";
      setError(msg);
    },
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={[
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          isDragActive ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-gray-50 hover:border-gray-300",
          (disabled || progress !== null) ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <div className="mb-2 text-3xl">
          {accept === "video" ? "🎬" : accept === "image" ? "🖼️" : "📎"}
        </div>
        {progress !== null ? (
          <div className="w-full max-w-xs">
            <p className="text-sm text-gray-600 mb-1">Subiendo… {progress}%</p>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : isDragActive ? (
          <p className="text-sm font-medium text-indigo-600">Suelta el archivo aquí</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">
              Arrastra un archivo o{" "}
              <span className="text-indigo-600 underline underline-offset-2">selecciona uno</span>
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {accept === "video"
                ? "MP4 o MOV · máx 100 MB · máx 90 s"
                : accept === "image"
                ? "JPEG, PNG o WEBP · máx 8 MB"
                : "Imagen o video"}
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
