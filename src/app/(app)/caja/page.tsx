import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import { CURRENCY_LABEL } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import {
  getOpenCashSession,
  listCashSessions,
} from "@/modules/cash/application/queries";
import {
  CASH_MOVEMENT_LABEL,
  PAYMENT_METHOD_LABEL,
  movesTheDrawer,
} from "@/modules/cash/domain/cash-movement";
import {
  CloseSessionForm,
  MovementForm,
  OpenSessionForm,
} from "@/modules/cash/ui/session-forms";

export default async function CashPage() {
  const user = await requirePageUser();
  if (!can(user.role, "cash.view")) redirect("/");

  const [session, history] = await Promise.all([getOpenCashSession(), listCashSessions(10)]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
        <p className="text-muted-foreground text-sm">
          {session
            ? `Abierta desde ${formatDateTime(session.openedAt)} por ${session.openedByName}`
            : "No hay ninguna caja abierta"}
        </p>
      </div>

      {!session ? (
        <Card>
          <CardHeader>
            <CardTitle>Abrir caja</CardTitle>
          </CardHeader>
          <CardContent>
            {can(user.role, "cash.operate") ? (
              <OpenSessionForm />
            ) : (
              <p className="text-muted-foreground text-sm">
                No tenés permiso para abrir la caja.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Estado del cajón</CardTitle>
              </CardHeader>
              <CardContent>
                {session.lines.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Todavía no hubo movimientos en efectivo.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground text-left text-xs">
                        <th className="pb-1">Moneda</th>
                        <th className="pb-1 text-right">Apertura</th>
                        <th className="pb-1 text-right">Debería haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.lines.map((line) => (
                        <tr key={line.currency} className="border-t">
                          <td className="py-1.5">{CURRENCY_LABEL[line.currency]}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatMoney(line.opening, line.currency)}
                          </td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">
                            {formatMoney(line.expected, line.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="text-muted-foreground mt-3 text-xs">
                  Solo el efectivo cuenta para el cajón. Transferencias y tarjetas se registran
                  como ingreso pero no se cuentan al arquear.
                </p>
              </CardContent>
            </Card>

            {session.paymentsOutside.length > 0 ? (
              <Alert className="border-amber-400 bg-amber-50">
                <AlertTriangle className="size-4" />
                <AlertTitle>Cobros tomados sin caja abierta</AlertTitle>
                <AlertDescription>
                  <ul className="mt-1 space-y-0.5">
                    {session.paymentsOutside.map((payment) => (
                      <li key={payment.id}>
                        {formatMoney(payment.amount, payment.currency)} de{" "}
                        {payment.repairOrderNumber} · {formatDateTime(payment.createdAt)}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Movimientos del día</CardTitle>
              </CardHeader>
              <CardContent>
                {session.movements.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Sin movimientos todavía.</p>
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

          <div className="space-y-4">
            {can(user.role, "cash.operate") ? (
              <Card>
                <CardHeader>
                  <CardTitle>Registrar movimiento</CardTitle>
                </CardHeader>
                <CardContent>
                  <MovementForm />
                </CardContent>
              </Card>
            ) : null}

            {can(user.role, "cash.close") ? (
              <Card>
                <CardHeader>
                  <CardTitle>Cerrar caja</CardTitle>
                </CardHeader>
                <CardContent>
                  <CloseSessionForm sessionId={session.id} lines={session.lines} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cierres anteriores</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no se cerró ninguna caja.</p>
          ) : (
            <ul className="divide-y text-sm">
              {history.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/caja/${entry.id}`}
                    className="hover:bg-muted/50 -mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2"
                  >
                    <span>{formatDateTime(entry.openedAt)}</span>
                    <span className="text-muted-foreground text-xs">
                      {entry.openedByName}
                      {entry.closedByName ? ` · cerró ${entry.closedByName}` : ""}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {entry.movementCount} movimientos
                    </span>
                    <span className="ml-auto">
                      {entry.closedAt === null ? (
                        <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-900">
                          Abierta
                        </span>
                      ) : entry.hasDifference ? (
                        <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs text-red-900">
                          Con diferencia
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">
                          Cuadrada
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
