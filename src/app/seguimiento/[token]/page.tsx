import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/shared/domain/datetime";
import { getPublicRepairStatus } from "@/modules/repairs/application/queries";
import {
  REPAIR_STATUS_LABEL,
  CLOSED_STATUSES,
  type RepairStatus,
} from "@/modules/repairs/domain/repair-status";

/** Nothing here should ever reach a search engine. */
export const metadata: Metadata = {
  title: "Seguimiento de reparación — MarcosTech",
  robots: { index: false, follow: false },
};

/** The visible journey, in the order a customer expects to travel it. */
const CUSTOMER_JOURNEY: RepairStatus[] = [
  "RECEIVED",
  "IN_DIAGNOSIS",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repair = await getPublicRepairStatus(token);

  // A wrong or guessed token is indistinguishable from a nonexistent order.
  if (!repair) notFound();

  const currentIndex = journeyIndex(repair.status);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-muted-foreground text-sm">MarcosTech · Servicio técnico</p>
          <CardTitle className="font-mono text-xl">{repair.orderNumber}</CardTitle>
          <p className="text-sm">
            {repair.brandName} {repair.modelName}
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/40 p-4 text-center">
            <p className="text-muted-foreground text-xs uppercase">Estado actual</p>
            <p className="text-lg font-semibold">{REPAIR_STATUS_LABEL[repair.status]}</p>
          </div>

          {repair.status === "CANCELLED" ? null : (
            <ol className="space-y-3">
              {CUSTOMER_JOURNEY.map((status, index) => {
                const reached = currentIndex >= index;
                return (
                  <li key={status} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-full border-2",
                        reached ? "border-emerald-600 bg-emerald-600" : "border-zinc-300",
                      )}
                    />
                    <span className={cn("text-sm", reached ? "font-medium" : "text-muted-foreground")}>
                      {REPAIR_STATUS_LABEL[status]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <dl className="text-muted-foreground space-y-1 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt>Ingreso</dt>
              <dd>{formatDate(repair.receivedAt)}</dd>
            </div>
            {repair.estimatedDeliveryAt ? (
              <div className="flex justify-between">
                <dt>Entrega estimada</dt>
                <dd>{formatDate(repair.estimatedDeliveryAt)}</dd>
              </div>
            ) : null}
            {repair.deliveredAt ? (
              <div className="flex justify-between">
                <dt>Entregado</dt>
                <dd>{formatDate(repair.deliveredAt)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="text-muted-foreground text-center text-xs">
            ¿Dudas? Escribinos por WhatsApp mencionando tu número de orden.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Maps any internal status onto the simplified journey the customer sees, so
 * intermediate states like "esperando repuesto" still show real progress.
 */
function journeyIndex(status: RepairStatus): number {
  const direct = CUSTOMER_JOURNEY.indexOf(status);
  if (direct >= 0) return direct;

  switch (status) {
    case "QUOTE_SENT":
      return CUSTOMER_JOURNEY.indexOf("IN_DIAGNOSIS");
    case "AWAITING_PARTS":
      return CUSTOMER_JOURNEY.indexOf("IN_REPAIR");
    case "REPAIRED":
      return CUSTOMER_JOURNEY.indexOf("IN_REPAIR");
    default:
      return (CLOSED_STATUSES as readonly string[]).includes(status)
        ? CUSTOMER_JOURNEY.length
        : 0;
  }
}

export const dynamic = "force-dynamic";
