import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { env, publicUrlLooksLocal } from "@/shared/infrastructure/env";
import { formatDateTime } from "@/shared/domain/datetime";
import { balanceOf, formatMoney } from "@/shared/ui/money-text";
import { formatPhone } from "@/modules/customers/domain/phone";
import { getRepairDetail } from "@/modules/repairs/application/queries";
import { REPAIR_STATUS_LABEL } from "@/modules/repairs/domain/repair-status";
import { URGENCY_LABEL } from "@/modules/repairs/domain/repair-urgency";
import {
  CHECKLIST_LABEL,
  checklistStateLabel,
} from "@/modules/repairs/domain/repair-checklist";
import { PrintButton } from "@/modules/repairs/ui/print-button";

const SERVICE_TERMS = [
  "El equipo se recibe en el estado descrito arriba. Las fotos tomadas al ingreso forman parte de este comprobante.",
  "El presupuesto puede variar si al abrir el equipo se detectan fallas adicionales. Se informa antes de continuar.",
  "Equipos con daño por humedad no tienen garantía de reparación.",
  "Pasados 90 días sin retirar el equipo, el local no se responsabiliza por su guarda.",
  "La garantía cubre exclusivamente la reparación realizada, no fallas nuevas ni daños físicos posteriores.",
];

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser();
  const { id } = await params;

  const repair = await getRepairDetail(id);
  if (!repair) notFound();

  const trackingUrl = `${env.APP_URL}/seguimiento/${repair.publicToken}`;
  const qrDataUrl = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 240 });

  // A receipt is printed and handed over. If the public URL was never pointed at
  // the real domain, the QR leads nowhere and nobody finds out until a customer
  // scans it, so it is said here, on screen, before anyone hits print.
  const qrIsBroken = publicUrlLooksLocal();

  const balance = balanceOf(repair.finalPrice, repair.paidAmount, repair.currency);
  const testedItems = repair.checklist.filter((entry) => entry.state !== "NOT_TESTED");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" render={<Link href={`/reparaciones/${repair.id}`} />}>
          <ArrowLeft className="size-4" />
          Volver a la orden
        </Button>
        <PrintButton />
      </div>

      {qrIsBroken ? (
        <div className="mx-auto max-w-3xl rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
          El QR apunta a <code>{env.APP_URL}</code>, que no es una dirección pública.
          Configurá APP_URL con el dominio real antes de entregar comprobantes
          impresos.
        </div>
      ) : null}

      <article className="bg-white mx-auto max-w-3xl space-y-5 rounded-lg border p-6 text-sm print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">MarcosTech</h1>
            <p className="text-muted-foreground">Servicio técnico de celulares y tablets</p>
            <p className="mt-2 font-mono text-lg font-semibold">{repair.orderNumber}</p>
            <p className="text-muted-foreground text-xs">
              Ingreso: {formatDateTime(repair.receivedAt)}
            </p>
          </div>

          <div className="text-center">
            <Image
              src={qrDataUrl}
              alt={`Código QR de seguimiento de la orden ${repair.orderNumber}`}
              width={120}
              height={120}
              unoptimized
            />
            <p className="mt-1 text-[10px] leading-tight">
              Escaneá para ver
              <br />
              el estado de tu equipo
            </p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <Block title="Cliente">
            <Line label="Nombre" value={repair.customer.fullName} />
            <Line label="Teléfono" value={formatPhone(repair.customer.phone)} />
          </Block>

          <Block title="Equipo">
            <Line label="Marca y modelo" value={`${repair.brandName} ${repair.modelName}`} />
            <Line label="IMEI / serie" value={repair.imei ?? "No informado"} />
            <Line label="Urgencia" value={URGENCY_LABEL[repair.urgency]} />
          </Block>
        </section>

        <section className="space-y-2">
          <Block title="Problema informado">
            <p className="whitespace-pre-wrap">{repair.reportedProblem}</p>
          </Block>
          <Block title="Estado físico al recibirlo">
            <p className="whitespace-pre-wrap">{repair.physicalCondition ?? "Sin observaciones"}</p>
          </Block>
          <Block title="Accesorios recibidos">
            <p className="whitespace-pre-wrap">
              {repair.deliveredAccessories ?? "Ninguno"}
            </p>
          </Block>
        </section>

        {testedItems.length > 0 ? (
          <Block title="Checklist de recepción">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {testedItems.map((entry) => (
                <li key={entry.key} className="flex justify-between gap-2">
                  <span>{CHECKLIST_LABEL[entry.key]}</span>
                  <span className="font-medium">
                    {checklistStateLabel(entry.key, entry.state)}
                    {entry.note ? ` (${entry.note})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        <section className="grid gap-4 border-y py-4 sm:grid-cols-2">
          <Block title="Montos">
            <Line
              label="Precio estimado"
              value={formatMoney(repair.finalPrice, repair.currency)}
            />
            <Line label="Pagado" value={formatMoney(repair.paidAmount, repair.currency)} />
            <Line label="Saldo pendiente" value={formatMoney(balance, repair.currency)} strong />
          </Block>

          <Block title="Entrega">
            <Line label="Estado actual" value={REPAIR_STATUS_LABEL[repair.status]} />
            <Line
              label="Fecha estimada"
              value={
                repair.estimatedDeliveryAt ? formatDateTime(repair.estimatedDeliveryAt) : "A confirmar"
              }
            />
            <Line label="Recibido por" value={repair.receivedBy.fullName} />
          </Block>
        </section>

        <section>
          <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase">
            Condiciones del servicio
          </h2>
          <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-[11px] leading-snug">
            {SERVICE_TERMS.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
        </section>

        <footer className="grid gap-8 pt-8 sm:grid-cols-2">
          <SignatureLine label="Firma del cliente" />
          <SignatureLine label="Firma de MarcosTech" />
        </footer>
      </article>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold tracking-wide uppercase">{title}</h2>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : undefined}>{value}</span>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="border-t border-black/60" />
      <p className="mt-1 text-[11px]">{label}</p>
    </div>
  );
}
