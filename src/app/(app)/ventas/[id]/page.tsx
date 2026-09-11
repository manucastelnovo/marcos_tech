import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import { formatMoney } from "@/shared/ui/money-text";
import { formatPhone } from "@/modules/customers/domain/phone";
import { getSaleDetail } from "@/modules/sales/application/queries";
import { PAYMENT_METHOD_LABEL } from "@/modules/cash/domain/cash-movement";
import { PrintButton } from "@/modules/repairs/ui/print-button";

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "sale.view")) redirect("/");

  const { id } = await params;
  const sale = await getSaleDetail(id);
  if (!sale) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" render={<Link href="/ventas" />}>
          <ArrowLeft className="size-4" />
          Volver a ventas
        </Button>
        <PrintButton />
      </div>

      <article className="bg-white mx-auto max-w-lg space-y-4 rounded-lg border p-6 text-sm print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="border-b pb-3 text-center">
          <h1 className="text-lg font-bold tracking-tight">MarcosTech</h1>
          <p className="text-muted-foreground text-xs">
            Servicio técnico de celulares y tablets
          </p>
          <p className="mt-2 font-mono text-base font-semibold">{sale.number}</p>
          <p className="text-muted-foreground text-xs">{formatDateTime(sale.createdAt)}</p>
        </header>

        {sale.customer ? (
          <div className="text-xs">
            <span className="text-muted-foreground">Cliente: </span>
            {sale.customer.fullName} · {formatPhone(sale.customer.phone)}
          </div>
        ) : null}

        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="pb-1">Producto</th>
              <th className="w-10 pb-1 text-right">Cant.</th>
              <th className="w-24 pb-1 text-right">Precio</th>
              <th className="w-24 pb-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line) => (
              <tr key={line.id} className="border-t">
                <td className="py-1.5">{line.description}</td>
                <td className="py-1.5 text-right tabular-nums">{line.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(line.unitPrice, sale.currency)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatMoney(line.lineTotal, sale.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1 border-t pt-3">
          <Row label="Subtotal" value={formatMoney(sale.subtotal, sale.currency)} />
          {Number(sale.discount) > 0 ? (
            <Row label="Descuento" value={formatMoney(sale.discount, sale.currency)} />
          ) : null}
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">
              {formatMoney(sale.total, sale.currency)}
            </span>
          </div>
          <Row label="Forma de pago" value={PAYMENT_METHOD_LABEL[sale.method]} />
          <Row label="Vendedor" value={sale.sellerName} />
          {sale.exchangeRate ? (
            <Row
              label="Cotización usada"
              value={`${Number(sale.exchangeRate).toLocaleString("es-PY")} Gs.`}
            />
          ) : null}
        </div>

        {sale.notes ? (
          <p className="text-muted-foreground text-xs">Nota: {sale.notes}</p>
        ) : null}

        <p className="text-muted-foreground border-t pt-3 text-center text-[11px]">
          Gracias por su compra. Cambios dentro de los 7 días con este ticket.
        </p>
      </article>

      {/* Margin is the shop's business, never the customer's. */}
      {can(user.role, "sale.view") ? (
        <Card className="mx-auto max-w-lg print:hidden">
          <CardContent className="flex items-center justify-between p-4 text-sm">
            <span className="text-muted-foreground">Ganancia de esta venta</span>
            <span
              className={
                Number(sale.margin) < 0
                  ? "font-semibold text-red-700"
                  : "font-semibold text-emerald-700"
              }
            >
              {formatMoney(sale.margin, sale.currency)}
            </span>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
