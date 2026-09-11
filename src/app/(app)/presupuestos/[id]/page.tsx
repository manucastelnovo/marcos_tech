import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDate, formatDateTime } from "@/shared/domain/datetime";
import { formatMoney } from "@/shared/ui/money-text";
import { formatPhone, toWhatsAppNumber } from "@/modules/customers/domain/phone";
import { getDeviceCatalog } from "@/modules/repairs/application/catalog";
import { getQuoteDetail } from "@/modules/quotes/application/queries";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  isExpired,
} from "@/modules/quotes/domain/quote";
import { QuoteActions } from "@/modules/quotes/ui/quote-actions";
import { QuoteForm } from "@/modules/quotes/ui/quote-form";
import { PrintButton } from "@/modules/repairs/ui/print-button";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "quote.view")) redirect("/");

  const { id } = await params;
  const [quote, catalog] = await Promise.all([getQuoteDetail(id), getDeviceCatalog()]);
  if (!quote) notFound();

  const canManage = can(user.role, "quote.manage");
  const expired = quote.status === "PENDING" && isExpired(quote.validUntil, new Date());

  const whatsAppMessage = `Hola${quote.customerName ? ` ${quote.customerName.split(" ")[0]}` : ""}, te paso el presupuesto ${quote.number} para tu ${quote.brandName} ${quote.modelName}: ${quote.description}. Total ${formatMoney(quote.total, quote.currency)}.`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" render={<Link href="/presupuestos" />}>
          <ArrowLeft className="size-4" />
          Volver a presupuestos
        </Button>
        <div className="flex flex-wrap gap-2">
          {quote.customerPhone ? (
            <Button
              variant="secondary"
              render={
                <a
                  href={`https://wa.me/${toWhatsAppNumber(quote.customerPhone)}?text=${encodeURIComponent(whatsAppMessage)}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Enviar por WhatsApp
            </Button>
          ) : null}
          <PrintButton />
        </div>
      </div>

      <article className="bg-white mx-auto max-w-2xl space-y-4 rounded-lg border p-6 text-sm print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">MarcosTech</h1>
            <p className="text-muted-foreground text-xs">
              Servicio técnico de celulares y tablets
            </p>
            <p className="mt-2 font-mono text-lg font-semibold">{quote.number}</p>
            <p className="text-muted-foreground text-xs">{formatDate(quote.createdAt)}</p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                QUOTE_STATUS_TONE[quote.status],
              )}
            >
              {QUOTE_STATUS_LABEL[quote.status]}
            </span>
            {quote.validUntil ? (
              <p className={cn("mt-1 text-xs", expired ? "text-red-700" : "text-muted-foreground")}>
                {expired ? "Vencido el " : "Válido hasta "}
                {formatDate(quote.validUntil)}
              </p>
            ) : null}
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-xs font-semibold uppercase">Cliente</h2>
            <p>{quote.customerLabel}</p>
            {quote.customerPhone ? <p>{formatPhone(quote.customerPhone)}</p> : null}
          </div>
          <div>
            <h2 className="mb-1 text-xs font-semibold uppercase">Equipo</h2>
            <p>
              {quote.brandName} {quote.modelName}
            </p>
          </div>
        </div>

        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase">Trabajo a realizar</h2>
          <p className="whitespace-pre-wrap">{quote.description}</p>
        </div>

        <div className="space-y-1 border-y py-3">
          {quote.partsCost ? (
            <Row label="Repuesto" value={formatMoney(quote.partsCost, quote.currency)} />
          ) : null}
          {quote.laborCost ? (
            <Row label="Mano de obra" value={formatMoney(quote.laborCost, quote.currency)} />
          ) : null}
          <div className="flex justify-between border-t pt-2">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">
              {formatMoney(quote.total, quote.currency)}
            </span>
          </div>
        </div>

        {quote.notes ? (
          <p className="text-muted-foreground text-xs">{quote.notes}</p>
        ) : null}

        <p className="text-muted-foreground text-[11px]">
          Este presupuesto puede variar si al abrir el equipo se detectan fallas adicionales. Se
          informa antes de continuar. Preparado por {quote.createdByName}.
        </p>
      </article>

      {quote.convertedOrderNumber ? (
        <Card className="mx-auto max-w-2xl print:hidden">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              Aceptado. Se abrió la orden{" "}
              <span className="font-mono font-medium">{quote.convertedOrderNumber}</span>.
            </span>
            <Button
              variant="secondary"
              size="sm"
              render={<Link href={`/reparaciones/${quote.convertedRepairId}`} />}
            >
              <ExternalLink className="size-4" />
              Ver la orden
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <div className="mx-auto max-w-2xl space-y-4 print:hidden">
          <Card>
            <CardHeader>
              <CardTitle>Respuesta del cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteActions
                quoteId={quote.id}
                status={quote.status}
                hasCustomer={Boolean(quote.customerId)}
                customerName={quote.customerName}
                customerPhone={quote.customerPhone}
              />
            </CardContent>
          </Card>

          {quote.status !== "ACCEPTED" ? (
            <Card>
              <CardHeader>
                <CardTitle>Editar presupuesto</CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteForm
                  catalog={catalog}
                  quoteId={quote.id}
                  initial={{
                    customerName: quote.customerName ?? "",
                    customerPhone: quote.customerPhone ?? "",
                    brandName: quote.brandName,
                    modelName: quote.modelName,
                    description: quote.description,
                    currency: quote.currency,
                    partsCost: quote.partsCost ?? "",
                    laborCost: quote.laborCost ?? "",
                    validDays: 15,
                    notes: quote.notes ?? "",
                  }}
                />
              </CardContent>
            </Card>
          ) : null}

          <p className="text-muted-foreground text-center text-xs">
            Creado por {quote.createdByName} el {formatDateTime(quote.createdAt)}
          </p>
        </div>
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
