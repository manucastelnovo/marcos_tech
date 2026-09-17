"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProductCategory } from "../domain/product";
import { removeProductImageAction, uploadProductImageAction } from "../actions";
import { ProductThumbnail } from "./product-thumbnail";

/** A product card is small. 800px is plenty and keeps the grid fast. */
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.4,
  maxWidthOrHeight: 800,
  useWebWorker: true,
  fileType: "image/jpeg",
};

export function ProductImageUploader({
  productId,
  name,
  category,
  imageUrl,
}: {
  productId: string;
  name: string;
  category: ProductCategory;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, startRemoving] = useTransition();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setIsUploading(true);

    try {
      const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
      const formData = new FormData();
      formData.append("productId", productId);
      formData.append(
        "file",
        new File([compressed], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
        }),
      );

      const result = await uploadProductImageAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Imagen actualizada");
      router.refresh();
    } catch {
      toast.error("No se pudo procesar la imagen");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove() {
    startRemoving(async () => {
      const result = await removeProductImageAction(productId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Imagen quitada");
      router.refresh();
    });
  }

  const busy = isUploading || isRemoving;

  return (
    <div className="space-y-3">
      <ProductThumbnail
        imageUrl={imageUrl}
        name={name}
        category={category}
        sizes="320px"
        className="aspect-square w-full rounded-lg border"
      />
      <p className="text-muted-foreground text-xs">
        Se muestra en el punto de venta. Sin imagen, se usa el ícono de la categoría.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {imageUrl ? "Cambiar imagen" : "Agregar imagen"}
        </Button>
        {imageUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar imagen"
            disabled={busy}
            onClick={remove}
          >
            {isRemoving ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
