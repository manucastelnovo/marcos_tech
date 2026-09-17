import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/shared/infrastructure/auth/session";
import {
  safeLocalPath,
  usingLocalPhotoStorage,
} from "@/shared/infrastructure/photo-storage";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Serves photos held by the local development adapter.
 *
 * Behind a session on purpose: these are pictures of customers' devices, not
 * public assets. In production Vercel Blob serves them directly and this route
 * is never reached.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (!usingLocalPhotoStorage) {
    return new Response("No disponible", { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { key } = await params;
  const target = safeLocalPath(key.join("/"));
  if (!target) return new Response("No encontrado", { status: 404 });

  const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()];
  if (!contentType) return new Response("No encontrado", { status: 404 });

  try {
    const data = await readFile(target);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
