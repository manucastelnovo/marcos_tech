import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Validated once at import time so a missing variable
 * fails the boot, not the first customer at the counter.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET debe tener al menos 16 caracteres"),
  APP_URL: z.url("APP_URL debe ser una URL válida"),
  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),
});

const parsed = serverEnvSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  APP_URL: process.env.APP_URL,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
});

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);

  // Printed as plain lines before throwing, and repeated after, so the cause
  // survives however the build log is trimmed or copied. A deploy that fails
  // for a missing variable must say which one without anyone digging.
  const banner = [
    "",
    "════════════════════════════════════════════════════════════",
    "  FALTAN VARIABLES DE ENTORNO O SON INVALIDAS",
    "════════════════════════════════════════════════════════════",
    ...details,
    "",
    "  Cargalas en Vercel: Settings -> Environment Variables,",
    "  marcando el entorno correcto (Production y Preview).",
    "  Después volvé a desplegar: los cambios no alcanzan al",
    "  despliegue que ya está corriendo.",
    "════════════════════════════════════════════════════════════",
    "",
  ].join("\n");

  console.error(banner);
  throw new Error(banner);
}

export const env = parsed.data;

/**
 * Whether the configured public URL would produce a usable QR code.
 *
 * Checked where the receipt is rendered rather than at import time: `next build`
 * runs with NODE_ENV=production, so an import-time throw would break every local
 * build instead of catching a misconfigured deploy.
 */
export function publicUrlLooksLocal(): boolean {
  return /localhost|127\.0\.0\.1/.test(env.APP_URL);
}

/** True when photo uploads should go to Vercel Blob instead of the local disk. */
export const hasBlobStorage = env.BLOB_READ_WRITE_TOKEN.length > 0;
