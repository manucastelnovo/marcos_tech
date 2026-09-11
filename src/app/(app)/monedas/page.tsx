import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import {
  listCurrentRates,
  listRateHistory,
} from "@/modules/cash/application/exchange-rates";
import { ExchangeRateForm } from "@/modules/cash/ui/exchange-rate-form";

const QUOTABLE = CURRENCIES.filter((currency) => currency !== "PYG") as Currency[];

export default async function ExchangeRatesPage() {
  const user = await requirePageUser();
  if (!can(user.role, "rate.manage")) redirect("/");

  const [current, ...histories] = await Promise.all([
    listCurrentRates(),
    ...QUOTABLE.map((currency) => listRateHistory(currency, 8)),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monedas</h1>
        <p className="text-muted-foreground text-sm">
          Cuántos guaraníes vale una unidad de cada moneda. Nada se edita: cada cambio es una
          fila nueva, y cada venta o reparación guarda la cotización con la que se hizo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cotización vigente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {current.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no se cargó ninguna cotización.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {current.map((entry) => (
                <li key={entry.currency} className="flex items-center gap-3 py-2">
                  <span className="font-medium">{CURRENCY_LABEL[entry.currency]}</span>
                  <span className="font-semibold tabular-nums">
                    {Number(entry.rate).toLocaleString("es-PY")} Gs.
                  </span>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatDateTime(entry.effectiveFrom)} · {entry.setByName}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ExchangeRateForm />
        </CardContent>
      </Card>

      {QUOTABLE.map((currency, index) => {
        const history = histories[index] ?? [];
        if (history.length === 0) return null;

        return (
          <Card key={currency}>
            <CardHeader>
              <CardTitle>Historial de {CURRENCY_LABEL[currency]}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {history.map((entry, position) => (
                  <li
                    key={`${entry.currency}-${entry.effectiveFrom.toISOString()}-${position}`}
                    className="flex items-center gap-3 py-1.5"
                  >
                    <span className="tabular-nums">
                      {Number(entry.rate).toLocaleString("es-PY")} Gs.
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDateTime(entry.effectiveFrom)} · {entry.setByName}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
