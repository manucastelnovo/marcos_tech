import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { env, hasBlobStorage } from "@/shared/infrastructure/env";
import {
  extensionFor,
  type PhotoStorage,
  type PhotoUpload,
  type StoredPhoto,
} from "@/shared/domain/photo-storage";

const LOCAL_ROOT = path.join(process.cwd(), ".local-blob");

/** Production adapter. */
class VercelBlobPhotoStorage implements PhotoStorage {
  async save(upload: PhotoUpload): Promise<StoredPhoto> {
    const key = buildKey(upload);
    const blob = await put(key, upload.data, {
      access: "public",
      contentType: upload.contentType,
      token: env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, pathname: blob.pathname };
  }

  async remove(pathname: string): Promise<void> {
    await del(pathname, { token: env.BLOB_READ_WRITE_TOKEN });
  }
}

/**
 * Development adapter. Writes under .local-blob/ and serves the files through
 * /api/photos, so nobody needs a Vercel token to work on the intake screen.
 *
 * It refuses to run in production. A serverless filesystem is read-only and
 * ephemeral, so falling back to it there would either crash on the first photo
 * or, worse, appear to work and lose the evidence on the next deploy.
 */
class LocalDiskPhotoStorage implements PhotoStorage {
  async save(upload: PhotoUpload): Promise<StoredPhoto> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Falta configurar BLOB_READ_WRITE_TOKEN: sin eso no se pueden guardar fotos en producción.",
      );
    }

    const key = buildKey(upload);
    const target = path.join(LOCAL_ROOT, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, upload.data);
    return { url: `/api/photos/${key}`, pathname: key };
  }

  async remove(pathname: string): Promise<void> {
    const target = safeLocalPath(pathname);
    if (!target) return;
    await unlink(target).catch(() => undefined);
  }
}

function buildKey(upload: PhotoUpload): string {
  return `${upload.folder}/${randomUUID()}.${extensionFor(upload.contentType)}`;
}

/**
 * Resolves a stored key under the local root, refusing anything that escapes
 * it. Without this check a crafted pathname could read or delete arbitrary
 * files on the machine.
 */
export function safeLocalPath(key: string): string | null {
  const target = path.resolve(LOCAL_ROOT, key);
  const root = path.resolve(LOCAL_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export const photoStorage: PhotoStorage = hasBlobStorage
  ? new VercelBlobPhotoStorage()
  : new LocalDiskPhotoStorage();

export const usingLocalPhotoStorage = !hasBlobStorage;
