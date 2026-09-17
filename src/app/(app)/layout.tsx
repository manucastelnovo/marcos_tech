import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can, permissionsFor } from "@/modules/users/domain/permissions";
import { getCashStatus } from "@/modules/cash/application/queries";
import { AppShell } from "@/shared/ui/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  // Only people who can see the register are told whether it is open.
  const cash = can(user.role, "cash.view") ? await getCashStatus() : null;

  return (
    <AppShell
      user={{ name: user.name, role: user.role }}
      permissions={permissionsFor(user.role)}
      cash={cash ? { isOpen: cash.isOpen } : null}
    >
      {children}
    </AppShell>
  );
}
