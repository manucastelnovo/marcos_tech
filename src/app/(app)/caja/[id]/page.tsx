import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import { CURRENCY_LABEL } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { getCashSession } from "@/modules/cash/application/queries";
import {
  CASH_MOVEMENT_LABEL,
  PAYMENT_METHOD_LABEL,
  movesTheDrawer,
} from "@/modules/cash/domain/cash-movement";

export default async function CashSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "cash.view")) redirect("/");

  const { id } = await params;
  const session = await getCashSession(id);
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Caja del {formatDateTime(session.openedAt)}
          </h1>
          <p className="text-muted-foreground text-sm">
            Abrió {session.openedByName}
            {session.closedAt
              ? ` · cerró ${session.closedByName} el ${formatDateTime(session.closedAt)}`
              : " · todavía abierta"}
          </p>
        </div>
        <Button variant="ghost" render={<Link href="/caja" />}>
          <ArrowLeft className="size-4" />
          Volver a caja
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Arqueo por moneda</CardTitle>
        </CardHeader>
        <CardContent>
          {session.lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hubo efectivo en esta caja.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="pb-1">Moneda</th>
                  <th className="pb-1 text-right">Apertura</th>
                  <th className="pb-1 text-right">Esperado</th>
                  <th className="pb-1 text-right">Contado</th>
                  <th className="pb-1 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((line) => (
                  <tr key={line.currency} className="border-t">
                    <td className="py-1.5">{CURRENCY_LABEL[line.currency]}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatMoney(line.opening, line.currency)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatMoney(line.expected, line.currency)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.counted === null ? "—" : formatMoney(line.counted, line.currency)}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 text-right font-medium tabular-nums",
                        line.difference === null
                          ? "text-muted-foreground"
                          : Number(line.difference) === 0
                            ? "text-emerald-700"
                            : "text-red-700",
                      )}
                    >
                      {line.difference === null
                        ? "—"
                        : formatMoney(line.difference, line.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {session.notes ? (
            <p className="text-muted-foreground mt-3 text-sm">Nota: {session.notes}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
        </CardHeader>
        <CardContent>
          {session.movements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin movimientos.</p>
          ) : (
            <ul className="divide-y text-sm">
              {session.movements.map((movement) => (
                <li key={movement.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      Number(movement.amount) > 0 ? "text-emerald-700" : "text-red-700",
                    )}
                  >
                    {formatMoney(movement.amount, movement.currency)}
                  </span>
                  <span>{CASH_MOVEMENT_LABEL[movement.type]}</span>
                  <span className="text-muted-foreground text-xs">
                    {PAYMENT_METHOD_LABEL[movement.method]}
                    {movesTheDrawer(movement.method) ? "" : " · no afecta el cajón"}
                  </span>
                  {movement.repairOrderNumber ? (
                    <Link
                      href={`/reparaciones/${movement.repairId}`}
                      className="font-mono text-xs hover:underline"
                    >
                      {movement.repairOrderNumber}
                    </Link>
                  ) : null}
                  {movement.description ? (
                    <span className="text-muted-foreground">{movement.description}</span>
                  ) : null}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatDateTime(movement.createdAt)} · {movement.actorName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
