"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CURRENCIES, CURRENCY_LABEL, Money, parseAmountInput, type Currency } from "@/shared/domain/money";
import { updatePricingAction } from "../actions";

/**
 * Prices, and the number the owner actually cares about.
 *
 * Profit is read as "precio final menos costo de repuesto". The spec lists
 * "costo del repuesto" as a cost and "mano de obra" as a component of the price
 * the customer pays, so labour is not subtracted again here.
 */
export function PricingForm({
  repairId,
  currency,
  exchangeRate,
  partsCost,
  laborCost,
  finalPrice,
  paidAmount,
}: {
  repairId: string;
  currency: Currency;
  exchangeRate: string | null;
  partsCost: string | null;
  laborCost: string | null;
  finalPrice: string | null;
  paidAmount: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    currency,
    exchangeRate: exchangeRate ?? "",
    partsCost: partsCost ?? "",
    laborCost: laborCost ?? "",
    finalPrice: finalPrice ?? "",
  });

  const totals = useMemo(() => {
    try {
      const price = parseAmountInput(form.finalPrice, form.currency);
      const parts = parseAmountInput(form.partsCost, form.currency) ?? Money.zero(form.currency);
      const paid = Money.of(paidAmount, form.currency);
      if (!price) return null;
      return {
        balance: price.minus(paid).format(),
        profit: price.minus(parts).format(),
      };
    } catch {
      return null;
    }
  }, [form.finalPrice, form.partsCost, form.currency, paidAmount]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updatePricingAction({ repairId, ...form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Montos guardados");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pricingCurrency">Moneda</Label>
          <Select
            value={form.currency}
            onValueChange={(value) => {
              if (value) setForm((current) => ({ ...current, currency: value as Currency }));
            }}
          >
            <SelectTrigger id="pricingCurrency">
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

        {form.currency !== "PYG" ? (
          <Field
            id="pricingExchangeRate"
            label="Cotización usada"
            value={form.exchangeRate}
            onChange={(value) => setForm((current) => ({ ...current, exchangeRate: value }))}
          />
        ) : null}

        <Field
          id="pricingPartsCost"
          label="Costo del repuesto"
          value={form.partsCost}
          onChange={(value) => setForm((current) => ({ ...current, partsCost: value }))}
        />
        <Field
          id="pricingLaborCost"
          label="Mano de obra"
          value={form.laborCost}
          onChange={(value) => setForm((current) => ({ ...current, laborCost: value }))}
        />
        <Field
          id="pricingFinalPrice"
          label="Precio final al cliente"
          value={form.finalPrice}
          onChange={(value) => setForm((current) => ({ ...current, finalPrice: value }))}
        />
      </div>

      {totals ? (
        <>
          <Separator />
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <dt className="text-sm">Saldo pendiente</dt>
              <dd className="font-semibold tabular-nums">{totals.balance}</dd>
            </div>
            <div className="flex items-center justify-between rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
              <dt className="text-sm">Ganancia estimada</dt>
              <dd className="font-semibold tabular-nums text-emerald-900">{totals.profit}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar montos"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
      />
    </div>
  );
}
