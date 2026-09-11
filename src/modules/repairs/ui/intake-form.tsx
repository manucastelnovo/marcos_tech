"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES, CURRENCY_LABEL, Money, parseAmountInput } from "@/shared/domain/money";
import { formatDate } from "@/shared/domain/datetime";
import { ComboboxInput } from "@/shared/ui/combobox-input";
import {
  CustomerSearchField,
  type SelectedCustomer,
} from "@/modules/customers/ui/customer-search-field";
import type { CustomerSuggestion } from "@/modules/customers/application/queries";
import { URGENCY_LABEL, URGENCY_LEVELS, type UrgencyLevel } from "../domain/repair-urgency";
import { REPAIR_STATUS_LABEL } from "../domain/repair-status";
import { warrantyStatus } from "../domain/warranty";
import { intakeSchema } from "../application/schemas";
import type { BrandCatalogEntry, TechnicianOption } from "../application/catalog";
import type { ImeiHistoryEntry } from "../application/queries";
import { createRepairAction, lookupImeiAction } from "../actions";
import {
  ChecklistField,
  checklistToPayload,
  emptyChecklist,
  type ChecklistValue,
} from "./checklist-field";

type FormState = {
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string;
  brandName: string;
  modelName: string;
  imei: string;
  physicalCondition: string;
  deliveredAccessories: string;
  reportedProblem: string;
  partsNeeded: string;
  urgency: UrgencyLevel;
  estimatedDeliveryAt: string;
  technicianId: string;
  currency: (typeof CURRENCIES)[number];
  exchangeRate: string;
  partsCost: string;
  laborCost: string;
  finalPrice: string;
  deposit: string;
};

const INITIAL: FormState = {
  customerName: "",
  customerPhone: "",
  customerWhatsapp: "",
  brandName: "",
  modelName: "",
  imei: "",
  physicalCondition: "",
  deliveredAccessories: "",
  reportedProblem: "",
  partsNeeded: "",
  urgency: "NORMAL",
  estimatedDeliveryAt: "",
  technicianId: "",
  currency: "PYG",
  exchangeRate: "",
  partsCost: "",
  laborCost: "",
  finalPrice: "",
  deposit: "",
};

/**
 * One screen, top to bottom, no wizard.
 *
 * The whole design serves a single number: a device has to be recorded in one
 * to three minutes. That is why the phone number leads, why the customer is
 * created inline, why the checklist is optional, and why Ctrl+Enter saves from
 * anywhere in the form.
 */
export function IntakeForm({
  catalog,
  technicians,
}: {
  catalog: BrandCatalogEntry[];
  technicians: TechnicianOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [checklist, setChecklist] = useState<ChecklistValue>(emptyChecklist);
  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [imeiHistory, setImeiHistory] = useState<ImeiHistoryEntry[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const brandNames = useMemo(() => catalog.map((brand) => brand.name), [catalog]);
  const modelNames = useMemo(() => {
    const brand = catalog.find(
      (entry) => entry.name.toLowerCase() === form.brandName.trim().toLowerCase(),
    );
    return brand ? brand.models : catalog.flatMap((entry) => entry.models);
  }, [catalog, form.brandName]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: [] } : current));
  }

  // Has this exact device been here before? Answering at intake is what turns a
  // warranty claim from an argument into a lookup.
  //
  // Clearing happens in the change handler, not here: a synchronous setState in
  // an effect body cascades renders.
  useEffect(() => {
    const imei = form.imei.trim();
    if (imei.length < 6) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLookingUp(true);
      const result = await lookupImeiAction(imei);
      if (cancelled) return;
      setIsLookingUp(false);
      setImeiHistory(result.ok ? result.data : []);
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.imei]);

  function handleImeiChange(value: string) {
    set("imei", value);
    if (value.trim().length < 6) {
      setImeiHistory([]);
      setIsLookingUp(false);
    }
  }

  const activeWarranty = useMemo(() => {
    const now = new Date();
    return imeiHistory.find(
      (entry) => warrantyStatus(entry.deliveredAt, entry.warrantyDays, now).isActive,
    );
  }, [imeiHistory]);

  const balance = useMemo(() => {
    try {
      const price = parseAmountInput(form.finalPrice, form.currency);
      if (!price) return null;
      const deposit = parseAmountInput(form.deposit, form.currency) ?? Money.zero(form.currency);
      return price.minus(deposit).format();
    } catch {
      return null;
    }
  }, [form.finalPrice, form.deposit, form.currency]);

  function buildPayload() {
    return {
      customerId: customer?.id ?? "",
      customerName: customer ? customer.fullName : form.customerName,
      customerPhone: customer ? customer.phone : form.customerPhone,
      customerWhatsapp: form.customerWhatsapp,
      brandName: form.brandName,
      modelName: form.modelName,
      imei: form.imei,
      physicalCondition: form.physicalCondition,
      deliveredAccessories: form.deliveredAccessories,
      reportedProblem: form.reportedProblem,
      partsNeeded: form.partsNeeded,
      urgency: form.urgency,
      estimatedDeliveryAt: form.estimatedDeliveryAt,
      technicianId: form.technicianId,
      currency: form.currency,
      exchangeRate: form.exchangeRate,
      partsCost: form.partsCost,
      laborCost: form.laborCost,
      finalPrice: form.finalPrice,
      deposit: form.deposit,
      checklist: checklistToPayload(checklist),
    };
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    setErrors({});

    const payload = buildPayload();
    // Validated here for instant feedback, and again on the server, which is
    // the check that actually counts.
    const parsed = intakeSchema.safeParse(payload);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_form";
        (fieldErrors[path] ??= []).push(issue.message);
      }
      setErrors(fieldErrors);
      toast.error("Revisá los datos marcados");
      return;
    }

    startTransition(async () => {
      const result = await createRepairAction(payload);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(`Orden ${result.data.orderNumber} creada`);
      router.push(`/reparaciones/${result.data.repairId}/comprobante`);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4 pb-28">
      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <CustomerSearchField
            phone={form.customerPhone}
            onPhoneChange={(value) => set("customerPhone", value)}
            selected={customer}
            error={fieldError("customerPhone")}
            onSelect={(suggestion: CustomerSuggestion) => {
              setCustomer({
                id: suggestion.id,
                fullName: suggestion.fullName,
                phone: suggestion.phone,
              });
              setErrors({});
            }}
            onClear={() => setCustomer(null)}
          />

          {customer ? null : (
            <div className="space-y-2">
              <Label htmlFor="customerName">Nombre del cliente</Label>
              <Input
                id="customerName"
                value={form.customerName}
                onChange={(event) => set("customerName", event.target.value)}
                placeholder="Juan Pérez"
                aria-invalid={Boolean(fieldError("customerName"))}
              />
              {fieldError("customerName") ? (
                <p className="text-destructive text-sm">{fieldError("customerName")}</p>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="customerWhatsapp">WhatsApp (si es distinto)</Label>
            <Input
              id="customerWhatsapp"
              value={form.customerWhatsapp}
              onChange={(event) => set("customerWhatsapp", event.target.value)}
              placeholder="0981 123456"
              inputMode="tel"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Equipo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ComboboxInput
              id="brandName"
              label="Marca"
              value={form.brandName}
              onChange={(value) => set("brandName", value)}
              options={brandNames}
              placeholder="Apple"
              error={fieldError("brandName")}
            />
            <ComboboxInput
              id="modelName"
              label="Modelo"
              value={form.modelName}
              onChange={(value) => set("modelName", value)}
              options={modelNames}
              placeholder="iPhone 13"
              error={fieldError("modelName")}
            />
            <div className="space-y-2">
              <Label htmlFor="imei">
                IMEI / serie
                {isLookingUp ? <Loader2 className="ml-2 inline size-3 animate-spin" /> : null}
              </Label>
              <Input
                id="imei"
                value={form.imei}
                onChange={(event) => handleImeiChange(event.target.value)}
                placeholder="Opcional"
                autoComplete="off"
              />
            </div>
          </div>

          {activeWarranty ? (
            <Alert className="border-amber-400 bg-amber-50">
              <ShieldCheck className="size-4" />
              <AlertTitle>Este equipo tiene garantía vigente</AlertTitle>
              <AlertDescription>
                Orden {activeWarranty.orderNumber}, entregada el{" "}
                {activeWarranty.deliveredAt ? formatDate(activeWarranty.deliveredAt) : "—"} con{" "}
                {activeWarranty.warrantyDays} días de garantía.
                {activeWarranty.workToPerform ? ` Trabajo: ${activeWarranty.workToPerform}.` : ""}
              </AlertDescription>
            </Alert>
          ) : imeiHistory.length > 0 ? (
            <Alert>
              <History className="size-4" />
              <AlertTitle>Este equipo ya estuvo en el local</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 space-y-0.5">
                  {imeiHistory.slice(0, 3).map((entry) => (
                    <li key={entry.id}>
                      {entry.orderNumber} · {formatDate(entry.receivedAt)} ·{" "}
                      {REPAIR_STATUS_LABEL[entry.status]} · {entry.reportedProblem}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="physicalCondition">Estado físico al recibirlo</Label>
              <Textarea
                id="physicalCondition"
                value={form.physicalCondition}
                onChange={(event) => set("physicalCondition", event.target.value)}
                placeholder="Pantalla rota, marco golpeado en la esquina inferior"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveredAccessories">Accesorios entregados</Label>
              <Textarea
                id="deliveredAccessories"
                value={form.deliveredAccessories}
                onChange={(event) => set("deliveredAccessories", event.target.value)}
                placeholder="Cargador, funda, chip"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Falla</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reportedProblem">Problema informado por el cliente</Label>
            <Textarea
              id="reportedProblem"
              value={form.reportedProblem}
              onChange={(event) => set("reportedProblem", event.target.value)}
              placeholder="No carga y se apaga solo"
              rows={3}
              aria-invalid={Boolean(fieldError("reportedProblem"))}
            />
            {fieldError("reportedProblem") ? (
              <p className="text-destructive text-sm">{fieldError("reportedProblem")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="partsNeeded">Repuestos necesarios</Label>
            <Textarea
              id="partsNeeded"
              value={form.partsNeeded}
              onChange={(event) => set("partsNeeded", event.target.value)}
              placeholder="Pin de carga, batería"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklist de recepción</CardTitle>
        </CardHeader>
        <CardContent>
          <ChecklistField value={checklist} onChange={setChecklist} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trabajo y entrega</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Urgencia</Label>
            <div className="flex gap-2">
              {URGENCY_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set("urgency", level)}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                    form.urgency === level
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {URGENCY_LABEL[level]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedDeliveryAt">Entrega estimada</Label>
            <Input
              id="estimatedDeliveryAt"
              type="datetime-local"
              value={form.estimatedDeliveryAt}
              onChange={(event) => set("estimatedDeliveryAt", event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="technicianId">Técnico responsable</Label>
            <Select
              value={form.technicianId || "none"}
              onValueChange={(value) => set("technicianId", !value || value === "none" ? "" : value)}
            >
              <SelectTrigger id="technicianId">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {technicians.map((technician) => (
                  <SelectItem key={technician.id} value={technician.id}>
                    {technician.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Montos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="currency">Moneda</Label>
            <Select
              value={form.currency}
              onValueChange={(value) => {
                if (value) set("currency", value as FormState["currency"]);
              }}
            >
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {CURRENCY_LABEL[currency]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AmountField
            id="partsCost"
            label="Costo de repuesto"
            value={form.partsCost}
            onChange={(value) => set("partsCost", value)}
            error={fieldError("partsCost")}
          />
          <AmountField
            id="laborCost"
            label="Mano de obra"
            value={form.laborCost}
            onChange={(value) => set("laborCost", value)}
            error={fieldError("laborCost")}
          />
          <AmountField
            id="finalPrice"
            label="Precio final al cliente"
            value={form.finalPrice}
            onChange={(value) => set("finalPrice", value)}
            error={fieldError("finalPrice")}
          />
          <AmountField
            id="deposit"
            label="Seña"
            value={form.deposit}
            onChange={(value) => set("deposit", value)}
            error={fieldError("deposit")}
          />

          <div className="space-y-2">
            <Label>Saldo pendiente</Label>
            <div className="flex h-9 items-center rounded-md border px-3 text-sm font-semibold">
              {balance ?? "—"}
            </div>
          </div>

          {form.currency !== "PYG" ? (
            <AmountField
              id="exchangeRate"
              label="Cotización usada"
              value={form.exchangeRate}
              onChange={(value) => set("exchangeRate", value)}
              error={fieldError("exchangeRate")}
              hint="Se guarda con la orden y no cambia después"
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 p-3">
          <p className="text-muted-foreground hidden text-sm sm:block">
            Ctrl + Enter para guardar
          </p>
          <Button type="submit" size="lg" disabled={isPending} className="ml-auto">
            {isPending ? "Guardando..." : "Guardar y generar comprobante"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function AmountField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="0"
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {!error && hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}
