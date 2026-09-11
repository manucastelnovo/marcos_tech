import type { UserRole } from "@/modules/users/domain/permissions";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
    };
  }
}

/**
 * The JWT interface lives in @auth/core/jwt. `next-auth/jwt` only re-exports it,
 * and augmenting a re-export does not reach the original declaration.
 */
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: UserRole;
  }
}

export {};
