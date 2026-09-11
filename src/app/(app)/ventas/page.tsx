import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import { CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { getSalesSummary, listSales } from "@/modules/sales/application/queries";
import { PAYMENT_METHOD_LABEL } from "@/modules/cash/domain/cash-movement";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "sale.view")) redirect("/");

  const { q } = await searchParams;
  const [sales, summary] = await Promise.all([listSales(q), getSalesSummary()]);

  const todayEntries = Object.entries(summary.today) as Array<[Currency, string]>;
  const monthEntries = Object.entries(summary.month) as Array<[Currency, string]>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {summary.todayCount} {summary.todayCount === 1 ? "venta hoy" : "ventas hoy"}
          </p>
        </div>
        {can(user.role, "sale.create") ? (
          <Button render={<Link href="/ventas/nueva" />}>Nueva venta</Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Totals title="Hoy" entries={todayEntries} />
        <Totals title="Este mes" entries={monthEntries} />
      </div>

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Número de venta, cliente o producto"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {sales.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            No hay ventas que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sales.map((sale) => (
            <Link key={sale.id} href={`/ventas/${sale.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <span className="font-mono text-sm font-semibold">{sale.number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {sale.customerName ?? "Sin cliente"}
                      {" · "}
                      {sale.lineCount} {sale.lineCount === 1 ? "producto" : "productos"}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatDateTime(sale.createdAt)} · {sale.sellerName} ·{" "}
                      {PAYMENT_METHOD_LABEL[sale.method]}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(sale.total, sale.currency)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Totals are listed per currency rather than summed. One number mixing
 * guaraníes and dollars would need a rate and would restate the past every time
 * that rate moved.
 */
function Totals({ title, entries }: { title: string; entries: Array<[Currency, string]> }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-muted-foreground text-sm">{title}</div>
        {entries.length === 0 ? (
          <div className="text-2xl font-semibold tabular-nums">—</div>
        ) : (
          entries.map(([currency, total]) => (
            <div key={currency} className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground text-xs">{CURRENCY_LABEL[currency]}</span>
              <span className="text-xl font-semibold tabular-nums">
                {formatMoney(total, currency)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
