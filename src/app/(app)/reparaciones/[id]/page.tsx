import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime, formatRelative } from "@/shared/domain/datetime";
import { MoneyText, balanceOf, formatMoney } from "@/shared/ui/money-text";
import { Money } from "@/shared/domain/money";
import { getRepairDetail } from "@/modules/repairs/application/queries";
import { listWhatsAppTemplates } from "@/modules/repairs/application/catalog";
import { isOverdue } from "@/modules/repairs/domain/repair-status";
import { warrantyStatus } from "@/modules/repairs/domain/warranty";
import {
  CHECKLIST_LABEL,
  checklistStateLabel,
  completeChecklist,
} from "@/modules/repairs/domain/repair-checklist";
import { OverdueBadge, StatusBadge, UrgencyBadge } from "@/modules/repairs/ui/badges";
import { StatusActions } from "@/modules/repairs/ui/status-actions";
import { DiagnosisForm } from "@/modules/repairs/ui/diagnosis-form";
import { PricingForm } from "@/modules/repairs/ui/pricing-form";
import { PhotoUploader } from "@/modules/repairs/ui/photo-uploader";
import { WhatsAppActions } from "@/modules/repairs/ui/whatsapp-actions";
import {
  listRepairParts,
  repairPartsCost,
} from "@/modules/inventory/application/queries";
import { RepairPartsBlock } from "@/modules/inventory/ui/repair-parts-block";
import {
  getOpenCashSession,
  listRepairPayments,
} from "@/modules/cash/application/queries";
import { RepairPaymentsBlock } from "@/modules/cash/ui/repair-payments-block";

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  const { id } = await params;

  const [repair, templates, parts, partsCost, payments, openSession] = await Promise.all([
    getRepairDetail(id),
    listWhatsAppTemplates(),
    listRepairParts(id),
    repairPartsCost(id),
    listRepairPayments(id),
    getOpenCashSession(),
  ]);
  if (!repair) notFound();

  const now = new Date();
  const overdue = isOverdue(repair.status, repair.estimatedDeliveryAt, now);
  const warranty = warrantyStatus(repair.deliveredAt, repair.warrantyDays, now);
  const balance = balanceOf(repair.finalPrice, repair.paidAmount, repair.currency);
  const device = `${repair.brandName} ${repair.modelName}`;

  // Only parts costed in the repair's own currency roll into its margin. Mixing
  // guaraníes and dollars into one total would be a lie; the conversion belongs
  // to the reporting slice, with each record's own frozen rate.
  const realPartsCost = partsCost[repair.currency] ?? null;
  const margin =
    realPartsCost && repair.finalPrice
      ? Money.of(repair.finalPrice, repair.currency)
          .minus(Money.of(realPartsCost, repair.currency))
          .toDecimalString()
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              {repair.orderNumber}
            </h1>
            <StatusBadge status={repair.status} />
            <UrgencyBadge urgency={repair.urgency} />
            {overdue ? <OverdueBadge /> : null}
          </div>
          <p className="text-muted-foreground text-sm">
            {device} · Recibido {formatDateTime(repair.receivedAt)} por {repair.receivedBy.fullName}
          </p>
        </div>

        <Button
          variant="secondary"
          render={<Link href={`/reparaciones/${repair.id}/comprobante`} />}
        >
          <Printer className="size-4" />
          Comprobante
        </Button>
      </div>

      {warranty.granted ? (
        <Alert className={warranty.isActive ? "border-emerald-400 bg-emerald-50" : undefined}>
          <ShieldCheck className="size-4" />
          <AlertTitle>
            {warranty.isActive ? "Garantía vigente" : "Garantía vencida"}
          </AlertTitle>
          <AlertDescription>
            {repair.warrantyDays} días desde la entrega.
            {warranty.expiresAt
              ? ` Vence ${formatRelative(warranty.expiresAt)} (${formatDateTime(warranty.expiresAt)}).`
              : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Equipo y falla</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Marca y modelo" value={device} />
              <Detail label="IMEI / serie" value={repair.imei ?? "—"} mono />
              <Detail label="Estado físico" value={repair.physicalCondition ?? "—"} />
              <Detail label="Accesorios recibidos" value={repair.deliveredAccessories ?? "—"} />
              <Separator />
              <Detail label="Problema informado" value={repair.reportedProblem} />
              <Detail label="Diagnóstico técnico" value={repair.technicalDiagnosis ?? "—"} />
              <Detail label="Reparación realizada" value={repair.workToPerform ?? "—"} />
              <Detail label="Repuestos" value={repair.partsNeeded ?? "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Checklist de recepción</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {completeChecklist(repair.checklist).map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{CHECKLIST_LABEL[entry.key]}</dt>
                    <dd className="font-medium">
                      {checklistStateLabel(entry.key, entry.state)}
                      {entry.note ? ` (${entry.note})` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Repuestos usados</CardTitle>
            </CardHeader>
            <CardContent>
              <RepairPartsBlock
                repairId={repair.id}
                repairCurrency={repair.currency}
                parts={parts}
                partsCost={partsCost}
                canEdit={can(user.role, "repair.usePart")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cobros</CardTitle>
            </CardHeader>
            <CardContent>
              <RepairPaymentsBlock
                repairId={repair.id}
                repairCurrency={repair.currency}
                payments={payments}
                balance={balance}
                hasOpenSession={openSession !== null}
                canCharge={can(user.role, "cash.operate")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fotos del equipo</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoUploader
                repairId={repair.id}
                photos={repair.photos}
                canUpload={can(user.role, "repair.uploadPhoto")}
              />
            </CardContent>
          </Card>

          {can(user.role, "repair.editDiagnosis") ? (
            <Card>
              <CardHeader>
                <CardTitle>Diagnóstico</CardTitle>
              </CardHeader>
              <CardContent>
                <DiagnosisForm
                  repairId={repair.id}
                  technicalDiagnosis={repair.technicalDiagnosis}
                  workToPerform={repair.workToPerform}
                  partsNeeded={repair.partsNeeded}
                />
              </CardContent>
            </Card>
          ) : null}

          {can(user.role, "repair.editPricing") ? (
            <Card>
              <CardHeader>
                <CardTitle>Montos</CardTitle>
              </CardHeader>
              <CardContent>
                <PricingForm
                  repairId={repair.id}
                  currency={repair.currency}
                  exchangeRate={repair.exchangeRate}
                  partsCost={repair.partsCost}
                  laborCost={repair.laborCost}
                  finalPrice={repair.finalPrice}
                  paidAmount={repair.paidAmount}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Link
                href={`/clientes/${repair.customer.id}`}
                className="font-medium hover:underline"
              >
                {repair.customer.fullName}
              </Link>
              <Detail label="Teléfono" value={repair.customer.phone} />
              <Separator />
              <WhatsAppActions
                templates={templates}
                phone={repair.customer.whatsapp ?? repair.customer.phone}
                customerName={repair.customer.fullName}
                device={device}
                orderNumber={repair.orderNumber}
                finalPrice={repair.finalPrice}
                balance={balance}
                currency={repair.currency}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Precio final">
                <MoneyText amount={repair.finalPrice} currency={repair.currency} />
              </Row>
              <Row label="Pagado">
                <MoneyText amount={repair.paidAmount} currency={repair.currency} />
              </Row>
              <Row label="Saldo">
                <span className="font-semibold">{formatMoney(balance, repair.currency)}</span>
              </Row>
              {realPartsCost !== null ? (
                <>
                  <Row label="Costo real de repuestos">
                    {formatMoney(realPartsCost, repair.currency)}
                  </Row>
                  <Row label="Ganancia">
                    <span className="font-semibold text-emerald-800">
                      {formatMoney(margin, repair.currency)}
                    </span>
                  </Row>
                </>
              ) : null}
              <Separator />
              <Row label="Técnico">{repair.technician?.fullName ?? "Sin asignar"}</Row>
              <Row label="Entrega estimada">
                {repair.estimatedDeliveryAt ? formatDateTime(repair.estimatedDeliveryAt) : "—"}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cambiar estado</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusActions
                repairId={repair.id}
                status={repair.status}
                canChangeStatus={can(user.role, "repair.changeStatus")}
                canDeliver={can(user.role, "repair.deliver")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {repair.statusHistory.map((entry) => (
                  <li key={entry.id} className="border-l-2 pl-3">
                    <div className="font-medium">
                      <StatusBadge status={entry.toStatus} />
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatDateTime(entry.changedAt)} · {entry.changedByName}
                    </div>
                    {entry.note ? <p className="mt-1">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={mono ? "font-mono break-all" : "whitespace-pre-wrap"}>{value}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
