import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { permissionsFor } from "@/modules/users/domain/permissions";
import { AppNav } from "@/shared/ui/app-nav";

/**
 * Every authenticated screen sits under this layout, so there is exactly one
 * place that decides whether a visitor gets in. Server Actions guard themselves
 * as well: this handles navigation, not authorisation.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();

  return (
    <>
      <AppNav
        user={{ name: user.name, role: user.role }}
        permissions={permissionsFor(user.role)}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
    </>
  );
}
