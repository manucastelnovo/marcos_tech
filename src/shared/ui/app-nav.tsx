"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Banknote,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  PlusCircle,
  FileText,
  History,
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type Permission, type UserRole } from "@/modules/users/domain/permissions";
import { logoutAction } from "@/modules/users/actions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requires?: Permission;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Panel", icon: LayoutDashboard },
  { href: "/reparaciones", label: "Reparaciones", icon: ClipboardList },
  { href: "/reparaciones/nueva", label: "Recibir equipo", icon: PlusCircle, requires: "repair.create" },
  { href: "/clientes", label: "Clientes", icon: Users, requires: "customer.view" },
  { href: "/stock", label: "Stock", icon: Package, requires: "stock.view" },
  { href: "/presupuestos", label: "Presupuestos", icon: FileText, requires: "quote.view" },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart, requires: "sale.view" },
  { href: "/caja", label: "Caja", icon: Banknote, requires: "cash.view" },
  // "Monedas", not "Cotizaciones": in the client's own spec that word also
  // means quotes for a repair, and confusing the two in a demo is expensive.
  { href: "/monedas", label: "Monedas", icon: TrendingUp, requires: "rate.manage" },
  { href: "/reportes", label: "Reportes", icon: TrendingUp, requires: "audit.view" },
  { href: "/auditoria", label: "Auditoría", icon: History, requires: "audit.view" },
  { href: "/plantillas", label: "Mensajes", icon: MessageSquare, requires: "template.manage" },
];

export function AppNav({
  user,
  permissions,
}: {
  user: { name: string; role: UserRole };
  permissions: Permission[];
}) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const allowed = new Set(permissions);

  return (
    <header className="bg-background sticky top-0 z-30 border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MarcosTech
        </Link>

        <nav className="order-3 -mx-4 flex w-full gap-1 overflow-x-auto px-4 md:order-none md:mx-0 md:w-auto md:px-0">
          {NAV_ITEMS.filter((item) => !item.requires || allowed.has(item.requires)).map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-muted-foreground text-xs">{ROLE_LABEL[user.role]}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar sesión"
            disabled={isPending}
            onClick={() => startTransition(() => logoutAction())}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
