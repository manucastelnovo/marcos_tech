"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/shared/domain/money";

export type CountValues = Partial<Record<Currency, string>>;

/**
 * One field per currency the drawer can hold.
 *
 * Blank means none of that currency, which is different from zero counted: a
 * shop that never touches reales should not have to type a zero every evening.
 */
export function CurrencyCountFields({
  values,
  onChange,
  idPrefix,
  highlight = [],
}: {
  values: CountValues;
  onChange: (values: CountValues) => void;
  idPrefix: string;
  /** Currencies that moved today, so the person knows which ones matter. */
  highlight?: readonly Currency[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CURRENCIES.map((currency) => (
        <div key={currency} className="space-y-2">
          <Label htmlFor={`${idPrefix}-${currency}`}>
            {CURRENCY_LABEL[currency]}
            {highlight.includes(currency) ? (
              <span className="text-muted-foreground ml-1 text-xs">(hubo movimientos)</span>
            ) : null}
          </Label>
          <Input
            id={`${idPrefix}-${currency}`}
            value={values[currency] ?? ""}
            inputMode="decimal"
            placeholder="0"
            onChange={(event) => onChange({ ...values, [currency]: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export function toCountsPayload(values: CountValues) {
  return CURRENCIES.filter((currency) => (values[currency] ?? "").trim() !== "").map(
    (currency) => ({ currency, amount: values[currency] as string }),
  );
}
