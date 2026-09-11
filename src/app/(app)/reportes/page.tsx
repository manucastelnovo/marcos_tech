import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDate, shopDayRange } from "@/shared/domain/datetime";
import { CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import {
  getProfitability,
  getTopProducts,
  type ProfitabilitySection,
} from "@/modules/reports/application/profitability";

const RANGES = [
  { key: "hoy", label: "Hoy", days: 0 },
  { key: "semana", label: "Últimos 7 días", days: 7 },
  { key: "mes", label: "Últimos 30 días", days: 30 },
  { key: "trimestre", label: "Últimos 90 días", days: 90 },
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "audit.view")) redirect("/");

  const params = await searchParams;
  const range = RANGES.find((option) => option.key === params.rango) ?? RANGES[2];

  const today = shopDayRange(new Date());
  const from = new Date(today.start.getTime() - range.days * 24 * 60 * 60 * 1000);
  const to = today.end;

  const [report, topProducts] = await Promise.all([
    getProfitability(from, to),
    getTopProducts(from, to),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rentabilidad</h1>
        <p className="text-muted-foreground text-sm">
          {formatDate(from)} al {formatDate(new Date(to.getTime() - 1))}
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {RANGES.map((option) => (
          <Link
            key={option.key}
            href={`/reportes?rango=${option.key}`}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              option.key === range.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Reparaciones entregadas"
          note="Solo cuenta el trabajo entregado. Una orden en el banco todavía no ganó nada."
          section={report.repairs}
        />
        <Section
          title="Ventas de mostrador"
          note="Ingreso menos el costo congelado de lo que salió del stock."
          section={report.sales}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos más vendidos</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hubo ventas de mostrador en este período.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {topProducts.map((product) => (
                <li
                  key={`${product.productId}-${product.description}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 truncate">{product.description}</span>
                  <span className="font-semibold tabular-nums">{product.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  note,
  section,
}: {
  title: string;
  note: string;
  section: ProfitabilitySection;
}) {
  const marginIsNegative = Number(section.guaraniMargin) < 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Row label="Ingreso" value={formatMoney(section.guaraniRevenue, "PYG")} />
          <Row label="Costo real" value={formatMoney(section.guaraniCost, "PYG")} />
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-medium">Ganancia</span>
            <span
              className={cn(
                "text-xl font-semibold tabular-nums",
                marginIsNegative ? "text-red-700" : "text-emerald-700",
              )}
            >
              {formatMoney(section.guaraniMargin, "PYG")}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            Expresado en guaraníes con la cotización que quedó guardada en cada registro, no con
            la de hoy.
          </p>
        </div>

        {section.byCurrency.length > 0 ? (
          <div className="space-y-1 border-t pt-3">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase">
              Por moneda
            </h3>
            {section.byCurrency.map((entry) => (
              <div key={entry.currency} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {CURRENCY_LABEL[entry.currency as Currency]} ({entry.count})
                </span>
                <span className="tabular-nums">
                  {formatMoney(entry.margin, entry.currency as Currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Sin movimientos en este período.</p>
        )}

        {section.unconvertible > 0 ? (
          <p className="text-sm text-amber-800">
            {section.unconvertible}{" "}
            {section.unconvertible === 1 ? "registro quedó" : "registros quedaron"} fuera del
            total en guaraníes porque no tenían cotización guardada.
          </p>
        ) : null}

        <p className="text-muted-foreground text-xs">{note}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
