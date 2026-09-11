import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { formatDate } from "@/shared/domain/datetime";
import { MoneyText, balanceOf, formatMoney } from "@/shared/ui/money-text";
import { getCustomerDetail } from "@/modules/customers/application/queries";
import { formatPhone, toWhatsAppNumber } from "@/modules/customers/domain/phone";
import { OPEN_STATUSES } from "@/modules/repairs/domain/repair-status";
import { StatusBadge } from "@/modules/repairs/ui/badges";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageUser();
  const { id } = await params;

  const customer = await getCustomerDetail(id);
  if (!customer) notFound();

  const openRepairs = customer.repairs.filter((repair) =>
    (OPEN_STATUSES as readonly string[]).includes(repair.status),
  );

  const outstanding = customer.repairs
    .map((repair) => ({
      repair,
      balance: balanceOf(repair.finalPrice, repair.paidAmount, repair.currency),
    }))
    .filter((entry) => entry.balance !== null && Number(entry.balance) > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.fullName}</h1>
          <p className="text-muted-foreground text-sm">
            {formatPhone(customer.phone)} · Cliente desde {formatDate(customer.createdAt)}
          </p>
        </div>
        <Button
          variant="secondary"
          render={
            <a
              href={`https://wa.me/${toWhatsAppNumber(customer.whatsapp ?? customer.phone)}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Reparaciones" value={String(customer.repairs.length)} />
        <Stat label="Abiertas" value={String(openRepairs.length)} />
        <Stat
          label="Órdenes con saldo"
          value={String(outstanding.length)}
          tone={outstanding.length > 0 ? "border-amber-300 bg-amber-50" : undefined}
        />
      </div>

      {customer.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{customer.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Historial de reparaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.repairs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no trajo ningún equipo.</p>
          ) : (
            <ul className="divide-y">
              {customer.repairs.map((repair) => {
                const balance = balanceOf(repair.finalPrice, repair.paidAmount, repair.currency);
                return (
                  <li key={repair.id}>
                    <Link
                      href={`/reparaciones/${repair.id}`}
                      className="hover:bg-muted/50 -mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-3"
                    >
                      <span className="font-mono text-sm font-medium">{repair.orderNumber}</span>
                      <span className="text-sm">
                        {repair.brandName} {repair.modelName}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {formatDate(repair.receivedAt)}
                      </span>
                      <div className="ml-auto flex items-center gap-3">
                        {balance && Number(balance) > 0 ? (
                          <span className="text-sm font-medium text-amber-700">
                            Saldo {formatMoney(balance, repair.currency)}
                          </span>
                        ) : null}
                        <MoneyText
                          amount={repair.finalPrice}
                          currency={repair.currency}
                          className="text-sm tabular-nums"
                        />
                        <StatusBadge status={repair.status} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className={tone}>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-sm">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
