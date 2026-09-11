"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/shared/infrastructure/auth/config";
import type { ActionResult } from "@/shared/application/action-result";

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  try {
    await signIn("credentials", {
      email: input.email,
      password: input.password,
      redirect: false,
    });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately vague: telling the visitor which half was wrong tells them
      // which emails exist.
      return { ok: false, error: "Email o contraseña incorrectos", code: "INVALID_CREDENTIALS" };
    }
    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
