import { z } from "zod";
import { DomainError } from "@/shared/domain/errors";

/**
 * What every Server Action returns. A discriminated union rather than a thrown
 * exception, because this value crosses the server/client boundary and has to
 * survive serialisation.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(error: string, code?: string): ActionResult<never> {
  return { ok: false, error, code };
}

/**
 * Wraps a use case invocation, turning domain errors and Zod failures into a
 * result the form layer can render. Unexpected errors are logged server-side
 * and reported generically, so internal details never reach the browser.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return success(await fn());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Revisá los datos del formulario",
        code: "VALIDATION",
        fieldErrors: flattenZodError(error),
      };
    }
    if (error instanceof DomainError) {
      return { ok: false, error: error.message, code: error.code };
    }
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Ocurrió un error inesperado. Intentá de nuevo.", code: "UNEXPECTED" };
  }
}

function flattenZodError(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_form";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}
