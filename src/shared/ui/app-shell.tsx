"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  ClipboardList,
  Coins,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  ShoppingCart,
  Smartphone,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type Permission, type UserRole } from "@/modules/users/domain/permissions";
import { logoutAction } from "@/modules/users/actions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requires?: Permission;
};

type NavGroup = { title?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/", label: "Panel", icon: LayoutDashboard }],
  },
  {
    title: "Operación",
    items: [
      { href: "/ventas/nueva", label: "Nueva venta", icon: ShoppingCart, requires: "sale.create" },
      { href: "/reparaciones/nueva", label: "Recibir equipo", icon: Smartphone, requires: "repair.create" },
      { href: "/reparaciones", label: "Reparaciones", icon: Wrench },
      { href: "/presupuestos", label: "Presupuestos", icon: FileText, requires: "quote.view" },
      { href: "/ventas", label: "Ventas", icon: ClipboardList, requires: "sale.view" },
      { href: "/caja", label: "Caja", icon: Banknote, requires: "cash.view" },
    ],
  },
  {
    title: "Gestión",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users, requires: "customer.view" },
      { href: "/stock", label: "Stock", icon: Package, requires: "stock.view" },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/reportes", label: "Reportes", icon: BarChart3, requires: "audit.view" },
      { href: "/auditoria", label: "Auditoría", icon: History, requires: "audit.view" },
      { href: "/monedas", label: "Monedas", icon: Coins, requires: "rate.manage" },
      { href: "/plantillas", label: "Mensajes", icon: MessageSquare, requires: "template.manage" },
    ],
  },
];

/**
 * Screens that need the whole width. The point of sale is operated all day and
 * every pixel of the sidebar is a pixel taken from the product grid.
 */
const FOCUS_ROUTES: Record<string, { backHref: string; backLabel: string; title: string }> = {
  "/ventas/nueva": { backHref: "/ventas", backLabel: "Ventas", title: "Nueva venta" },
};

export type ShellCashStatus = { isOpen: boolean } | null;

export function AppShell({
  user,
  permissions,
  cash,
  children,
}: {
  user: { name: string; role: UserRole };
  permissions: Permission[];
  cash: ShellCashStatus;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const allowed = new Set(permissions);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.requires || allowed.has(item.requires)),
  })).filter((group) => group.items.length > 0);

  const activeHref = findActiveHref(
    pathname,
    groups.flatMap((group) => group.items.map((item) => item.href)),
  );

  const focus = FOCUS_ROUTES[pathname];

  useEffect(() => {
    if (!isDrawerOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setIsDrawerOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isDrawerOpen]);

  if (focus) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-30 print:hidden">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
            <Brand compact />
            <nav aria-label="Ruta" className="flex min-w-0 items-center gap-2 text-sm">
              <Link
                href={focus.backHref}
                className="hover:text-sidebar-accent-foreground flex items-center gap-1.5"
              >
                <ArrowLeft className="size-4" />
                {focus.backLabel}
              </Link>
              <span aria-hidden>/</span>
              <span className="text-sidebar-accent-foreground truncate font-medium">
                {focus.title}
              </span>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <CashPill cash={cash} dark />
              <UserChip user={user} dark />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 lg:p-6 print:max-w-none print:p-0">{children}</main>
      </div>
    );
  }

  const sidebar = (
    <SidebarContent
      groups={groups}
      activeHref={activeHref}
      user={user}
      onNavigate={() => setIsDrawerOpen(false)}
    />
  );

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 hidden w-64 lg:flex lg:flex-col print:hidden">
        {sidebar}
      </aside>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="bg-sidebar text-sidebar-foreground relative flex h-full w-72 max-w-[85%] flex-col shadow-xl">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setIsDrawerOpen(false)}
              className="text-sidebar-foreground hover:text-sidebar-accent-foreground absolute top-4 right-3"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64 print:pl-0">
        <header className="bg-card/95 sticky top-0 z-20 border-b backdrop-blur print:hidden">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setIsDrawerOpen(true)}
              className="hover:bg-muted -ml-1 rounded-md p-1.5 lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div className="lg:hidden">
              <span className="font-semibold tracking-tight">MarcosTech</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <CashPill cash={cash} />
              <UserChip user={user} className="hidden sm:flex" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  groups,
  activeHref,
  user,
  onNavigate,
}: {
  groups: NavGroup[];
  activeHref: string | null;
  user: { name: string; role: UserRole };
  onNavigate: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <div className="px-5 pt-5 pb-4">
        <Brand />
      </div>

      <nav aria-label="Principal" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group, index) => (
          <div key={group.title ?? index} className="space-y-1">
            {group.title ? (
              <div className="text-sidebar-foreground/60 px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
                {group.title}
              </div>
            ) : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border flex items-center gap-3 border-t px-4 py-4">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sidebar-accent-foreground truncate text-sm font-medium">
            {user.name}
          </div>
          <div className="text-xs">{ROLE_LABEL[user.role]}</div>
        </div>
        <button
          type="button"
          aria-label="Cerrar sesión"
          disabled={isPending}
          onClick={() => startTransition(() => logoutAction())}
          className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md p-2 transition-colors"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg">
        <Smartphone className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="text-sidebar-accent-foreground block font-semibold tracking-tight">
          MarcosTech
        </span>
        {compact ? null : (
          <span className="text-sidebar-foreground/70 block text-[11px]">
            Electrónica y servicio técnico
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * The register state is on every screen because selling or charging with the
 * drawer closed leaves money out of the count. Text and dot, never color alone.
 */
function CashPill({ cash, dark = false }: { cash: ShellCashStatus; dark?: boolean }) {
  if (!cash) return null;

  return (
    <Link
      href="/caja"
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        cash.isOpen
          ? dark
            ? "border-success/40 text-sidebar-accent-foreground"
            : "border-success/30 bg-success/10 text-success"
          : dark
            ? "border-warning/50 text-sidebar-accent-foreground"
            : "border-warning/30 bg-warning/10 text-warning",
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 rounded-full", cash.isOpen ? "bg-success" : "bg-warning")}
      />
      {cash.isOpen ? "Caja abierta" : "Caja cerrada"}
    </Link>
  );
}

function UserChip({
  user,
  dark = false,
  className,
}: {
  user: { name: string; role: UserRole };
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Avatar name={user.name} />
      <div className="hidden leading-tight md:block">
        <div className={cn("text-sm font-medium", dark && "text-sidebar-accent-foreground")}>
          {user.name}
        </div>
        <div className={cn("text-xs", dark ? "text-sidebar-foreground" : "text-muted-foreground")}>
          {ROLE_LABEL[user.role]}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
      {initials || "?"}
    </span>
  );
}

/**
 * The most specific match wins, so "/ventas/nueva" lights "Nueva venta" and not
 * "Ventas" as well.
 */
function findActiveHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}
