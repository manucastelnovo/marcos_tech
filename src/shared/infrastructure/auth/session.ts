import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./config";
import { assertCan, type Permission, type UserRole } from "@/modules/users/domain/permissions";
import { UnauthenticatedError } from "@/shared/domain/errors";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

/** Returns the signed-in user, or null. Use in layouts that render either way. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

/**
 * For pages. Redirects to the login screen when there is no session.
 * Never call this from a Server Action: a redirect is not an error the form
 * layer can render.
 */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For Server Actions. Throws instead of redirecting, so `runAction` can turn it
 * into a message the form shows.
 *
 * Every mutating action starts here. Hiding a button is presentation; this is
 * the actual boundary.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Authenticates and authorises in one step. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  assertCan(user.role, permission);
  return user;
}
