export type StoredPhoto = {
  /** Where the browser can fetch it. */
  url: string;
  /** Storage key, kept so the file can be removed later. */
  pathname: string;
};

export type PhotoUpload = {
  repairId: string;
  fileName: string;
  contentType: string;
  data: Buffer;
};

/**
 * Where intake photos live.
 *
 * The domain only knows this interface. Vercel Blob in production and the local
 * disk in development are both adapters, so swapping to R2 or S3 later touches
 * one file.
 */
export interface PhotoStorage {
  save(upload: PhotoUpload): Promise<StoredPhoto>;
  remove(pathname: string): Promise<void>;
}

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isAllowedPhotoType(contentType: string): boolean {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(contentType);
}

export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}
