import Link from "next/link";
import { AlertTriangle, Clock, FileText, Inbox, PackageCheck, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { formatDate, formatRelative } from "@/shared/domain/datetime";
import { getDashboardSummary, listRepairs } from "@/modules/repairs/application/queries";
import { getStockAlerts } from "@/modules/inventory/application/queries";
import { getSalesSummary } from "@/modules/sales/application/queries";
import { getOpenCashSession } from "@/modules/cash/application/queries";
import { countPendingQuotes } from "@/modules/quotes/application/queries";
import { CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { can } from "@/modules/users/domain/permissions";
import { REPAIR_STATUS_LABEL } from "@/modules/repairs/domain/repair-status";
import { OverdueBadge, StatusBadge, UrgencyBadge } from "@/modules/repairs/ui/badges";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const [summary, attention, stock, sales, cashSession, pendingQuotes] = await Promise.all([
    getDashboardSummary(),
    listRepairs({ onlyOverdue: true, take: 8 }),
    can(user.role, "stock.view") ? getStockAlerts() : Promise.resolve(null),
    can(user.role, "sale.view") ? getSalesSummary() : Promise.resolve(null),
    can(user.role, "cash.view") ? getOpenCashSession() : Promise.resolve(null),
    can(user.role, "quote.view") ? countPendingQuotes() : Promise.resolve(null),
  ]);

  const tiles = [
    {
      label: "Ingresados hoy",
      value: summary.receivedToday,
      href: "/reparaciones",
      icon: Inbox,
      tone: "border-slate-200",
    },
    {
      label: "Pendientes",
      value: summary.open,
      href: "/reparaciones?estado=abiertas",
      icon: Wrench,
      tone: "border-blue-200 bg-blue-50/50",
    },
    {
      label: "Listos para retirar",
      value: summary.awaitingPickup,
      href: "/reparaciones?estado=READY_FOR_PICKUP",
      icon: PackageCheck,
      tone: "border-emerald-200 bg-emerald-50/50",
    },
    {
      label: "Urgentes",
      value: summary.urgent,
      href: "/reparaciones?urgencia=si",
      icon: AlertTriangle,
      tone: "border-amber-200 bg-amber-50/50",
    },
    {
      label: "Atrasados",
      value: summary.overdue,
      href: "/reparaciones?atrasadas=si",
      icon: Clock,
      tone: "border-red-200 bg-red-50/50",
    },
    ...(pendingQuotes !== null
      ? [
          {
            label: "Presupuestos pendientes",
            value: pendingQuotes,
            href: "/presupuestos?estado=PENDING",
            icon: FileText,
            tone: pendingQuotes > 0 ? "border-indigo-200 bg-indigo-50/50" : "border-slate-200",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {user.name}</h1>
        <p className="text-muted-foreground text-sm">Así está el taller ahora mismo.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.label} href={tile.href}>
              <Card className={cn("h-full transition-shadow hover:shadow-md", tile.tone)}>
                <CardContent className="space-y-1 p-4">
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Icon className="size-4" />
                    {tile.label}
                  </div>
                  <div className="text-3xl font-semibold tabular-nums">{tile.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Estado del taller</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          {(
            [
              "RECEIVED",
              "IN_DIAGNOSIS",
              "QUOTE_SENT",
              "AWAITING_APPROVAL",
              "IN_REPAIR",
              "AWAITING_PARTS",
              "REPAIRED",
              "READY_FOR_PICKUP",
            ] as const
          ).map((status) => (
            <Link key={status} href={`/reparaciones?estado=${status}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <span className="text-sm">{REPAIR_STATUS_LABEL[status]}</span>
                  <span className="text-xl font-semibold tabular-nums">
                    {summary.byStatus[status]}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {sales || cashSession !== null ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Ventas y caja</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {sales ? (
              <>
                <MoneyTile title="Ventas de hoy" totals={sales.today} href="/ventas" />
                <MoneyTile title="Ventas del mes" totals={sales.month} href="/ventas" />
              </>
            ) : null}
            {cashSession ? (
              <Link href="/caja">
                <Card className="h-full border-emerald-200 bg-emerald-50/50 transition-shadow hover:shadow-md">
                  <CardContent className="space-y-1 p-4">
                    <div className="text-muted-foreground text-sm">Caja abierta</div>
                    {cashSession.lines.length === 0 ? (
                      <div className="text-xl font-semibold">Sin movimientos</div>
                    ) : (
                      cashSession.lines.map((line) => (
                        <div
                          key={line.currency}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span className="text-muted-foreground text-xs">
                            {CURRENCY_LABEL[line.currency]}
                          </span>
                          <span className="text-lg font-semibold tabular-nums">
                            {formatMoney(line.expected, line.currency)}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {stock ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Stock</h2>
          <div className="grid grid-cols-3 gap-3">
            <StockTile
              label="Stock inconsistente"
              value={stock.negative}
              href="/stock?alertas=si"
              tone={stock.negative > 0 ? "border-red-300 bg-red-50" : undefined}
            />
            <StockTile
              label="Sin stock"
              value={stock.out}
              href="/stock?alertas=si"
              tone={stock.out > 0 ? "border-zinc-300" : undefined}
            />
            <StockTile
              label="Stock bajo"
              value={stock.low}
              href="/stock?alertas=si"
              tone={stock.low > 0 ? "border-amber-300 bg-amber-50" : undefined}
            />
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Necesitan atención</h2>
        {attention.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-6 text-center text-sm">
              Nada atrasado. Buen trabajo.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {attention.map((repair) => (
              <Link key={repair.id} href={`/reparaciones/${repair.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                    <span className="font-mono text-sm font-medium">{repair.orderNumber}</span>
                    <span className="text-sm">
                      {repair.brandName} {repair.modelName}
                    </span>
                    <span className="text-muted-foreground text-sm">{repair.customerName}</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <OverdueBadge />
                      <UrgencyBadge urgency={repair.urgency} />
                      <StatusBadge status={repair.status} />
                      <span className="text-muted-foreground text-xs">
                        {repair.estimatedDeliveryAt
                          ? `vencía ${formatRelative(repair.estimatedDeliveryAt)}`
                          : formatDate(repair.receivedAt)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StockTile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone?: string;
}) {
  return (
    <Link href={href}>
      <Card className={cn("h-full transition-shadow hover:shadow-md", tone)}>
        <CardContent className="space-y-1 p-4">
          <div className="text-muted-foreground text-sm">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Totals per currency, never summed into one number. A single figure mixing
 * guaraníes and dollars would need a rate, and would restate yesterday every
 * time that rate moved.
 */
function MoneyTile({
  title,
  totals,
  href,
}: {
  title: string;
  totals: Partial<Record<Currency, string>>;
  href: string;
}) {
  const entries = Object.entries(totals) as Array<[Currency, string]>;

  return (
    <Link href={href}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="space-y-1 p-4">
          <div className="text-muted-foreground text-sm">{title}</div>
          {entries.length === 0 ? (
            <div className="text-2xl font-semibold tabular-nums">—</div>
          ) : (
            entries.map(([currency, total]) => (
              <div key={currency} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-xs">{CURRENCY_LABEL[currency]}</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatMoney(total, currency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
