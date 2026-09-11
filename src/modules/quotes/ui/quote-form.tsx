"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { ComboboxInput } from "@/shared/ui/combobox-input";
import type { BrandCatalogEntry } from "@/modules/repairs/application/catalog";
import { QUOTE_VALIDITY_OPTIONS, quoteTotal } from "../domain/quote";
import { createQuoteAction, updateQuoteAction } from "../actions";

export type QuoteFormValues = {
  customerName: string;
  customerPhone: string;
  brandName: string;
  modelName: string;
  description: string;
  currency: Currency;
  partsCost: string;
  laborCost: string;
  validDays: number;
  notes: string;
};

const EMPTY: QuoteFormValues = {
  customerName: "",
  customerPhone: "",
  brandName: "",
  modelName: "",
  description: "",
  currency: "PYG",
  partsCost: "",
  laborCost: "",
  validDays: 15,
  notes: "",
};

/**
 * Quoting a walk-in.
 *
 * The customer is optional on purpose: someone asking what a screen costs is
 * not a customer yet, and demanding their details before answering is how a
 * shop loses the job.
 */
export function QuoteForm({
  catalog,
  quoteId,
  initial,
}: {
  catalog: BrandCatalogEntry[];
  quoteId?: string;
  initial?: QuoteFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<QuoteFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const brandNames = useMemo(() => catalog.map((brand) => brand.name), [catalog]);
  const modelNames = useMemo(() => {
    const brand = catalog.find(
      (entry) => entry.name.toLowerCase() === form.brandName.trim().toLowerCase(),
    );
    return brand ? brand.models : catalog.flatMap((entry) => entry.models);
  }, [catalog, form.brandName]);

  const total = useMemo(() => {
    try {
      return quoteTotal(form.partsCost || null, form.laborCost || null, form.currency);
    } catch {
      return null;
    }
  }, [form.partsCost, form.laborCost, form.currency]);

  function set<K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: [] } : current));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const payload = { ...form, ...(quoteId ? { quoteId } : {}) };
      const result = quoteId
        ? await updateQuoteAction(payload)
        : await createQuoteAction(payload);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      if (quoteId) {
        toast.success("Presupuesto actualizado");
        router.refresh();
      } else {
        const created = result.data as { id: string; number: string };
        toast.success(`Presupuesto ${created.number} creado`);
        router.push(`/presupuestos/${created.id}`);
      }
    });
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Equipo y trabajo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ComboboxInput
              id="quoteBrand"
              label="Marca"
              value={form.brandName}
              onChange={(value) => set("brandName", value)}
              options={brandNames}
              placeholder="Apple"
              error={fieldError("brandName")}
            />
            <ComboboxInput
              id="quoteModel"
              label="Modelo"
              value={form.modelName}
              onChange={(value) => set("modelName", value)}
              options={modelNames}
              placeholder="iPhone 13"
              error={fieldError("modelName")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quoteDescription">Trabajo a realizar</Label>
            <Textarea
              id="quoteDescription"
              rows={3}
              value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Cambio de pantalla"
              aria-invalid={Boolean(fieldError("description"))}
            />
            {fieldError("description") ? (
              <p className="text-destructive text-sm">{fieldError("description")}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="quoteCurrency">Moneda</Label>
            <Select
              value={form.currency}
              onValueChange={(value) => {
                if (value) set("currency", value as Currency);
              }}
            >
              <SelectTrigger id="quoteCurrency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CURRENCY_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Field
            id="quoteParts"
            label="Repuesto"
            value={form.partsCost}
            onChange={(value) => set("partsCost", value)}
            error={fieldError("partsCost")}
          />
          <Field
            id="quoteLabor"
            label="Mano de obra"
            value={form.laborCost}
            onChange={(value) => set("laborCost", value)}
            error={fieldError("laborCost")}
          />

          <div className="space-y-2">
            <Label>Total</Label>
            <div className="flex h-9 items-center rounded-md border px-3 font-semibold tabular-nums">
              {total === null ? "—" : formatMoney(total, form.currency)}
            </div>
            <p className="text-muted-foreground text-xs">Repuesto más mano de obra.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cliente y validez</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Los datos del cliente son opcionales. Se piden al aceptar el presupuesto.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quoteCustomerName">Nombre</Label>
              <Input
                id="quoteCustomerName"
                value={form.customerName}
                onChange={(event) => set("customerName", event.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quoteCustomerPhone">Teléfono</Label>
              <Input
                id="quoteCustomerPhone"
                value={form.customerPhone}
                inputMode="tel"
                onChange={(event) => set("customerPhone", event.target.value)}
                placeholder="0981 123456"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Válido por</Label>
            <div className="flex gap-2">
              {QUOTE_VALIDITY_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => set("validDays", days)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    form.validDays === days
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {days} días
                </button>
              ))}
              <button
                type="button"
                onClick={() => set("validDays", 0)}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  form.validDays === 0
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                Sin vencimiento
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quoteNotes">Notas</Label>
            <Input
              id="quoteNotes"
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Pantalla original, garantía 90 días"
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Guardando..." : quoteId ? "Guardar cambios" : "Crear presupuesto"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        placeholder="0"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
