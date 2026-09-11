"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Loader2 } from "lucide-react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadRepairPhotoAction } from "../actions";

/**
 * Compresses before uploading.
 *
 * A phone photo is several megabytes and the shop's connection is not fast. A
 * long-edge of 1600px is far more than enough to prove a screen was already
 * cracked when the device arrived.
 */
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.9,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: "image/jpeg",
};

export function PhotoUploader({
  repairId,
  photos,
  canUpload,
}: {
  repairId: string;
  photos: Array<{ id: string; url: string; caption: string | null }>;
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setIsUploading(true);
    setProgress({ done: 0, total: files.length });

    let uploaded = 0;

    for (const file of files) {
      try {
        const compressed = await imageCompression(file, COMPRESSION_OPTIONS);

        const formData = new FormData();
        formData.append("repairId", repairId);
        formData.append(
          "file",
          new File([compressed], renameToJpeg(file.name), { type: "image/jpeg" }),
        );

        const result = await uploadRepairPhotoAction(formData);
        if (!result.ok) {
          toast.error(result.error);
          continue;
        }
        uploaded += 1;
      } catch {
        toast.error(`No se pudo subir ${file.name}`);
      } finally {
        setProgress((current) =>
          current ? { ...current, done: current.done + 1 } : null,
        );
      }
    }

    setIsUploading(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";

    if (uploaded > 0) {
      toast.success(uploaded === 1 ? "Foto agregada" : `${uploaded} fotos agregadas`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-square overflow-hidden rounded-md border"
            >
              <Image
                src={photo.url}
                alt={photo.caption ?? "Foto del equipo"}
                fill
                sizes="(max-width: 640px) 33vw, 200px"
                className="object-cover"
                unoptimized
              />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Sin fotos. Sacá al menos una del estado en que llegó el equipo.
        </p>
      )}

      {canUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            hidden
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Subiendo {progress ? `${progress.done}/${progress.total}` : ""}
              </>
            ) : (
              <>
                <Camera className="size-4" />
                Agregar fotos
              </>
            )}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function renameToJpeg(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.jpg`;
}
