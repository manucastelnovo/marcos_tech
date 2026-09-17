"use client";

import { Banknote, CircleEllipsis, CreditCard, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "@/modules/cash/domain/cash-movement";
import { cashChange } from "../../domain/cart";

const METHOD_ICON: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  TRANSFER: Landmark,
  CARD: CreditCard,
  OTHER: CircleEllipsis,
};

export function PaymentMethods({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}) {
  return (
    <section aria-labelledby="pos-method-title" className="space-y-2">
      <h3 id="pos-method-title" className="text-sm font-semibold">
        Método de pago
      </h3>
      <div role="group" aria-labelledby="pos-method-title" className="grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map((method) => {
          const Icon = METHOD_ICON[method];
          const isActive = method === value;
          return (
            <button
              key={method}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(method)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary/10 text-primary ring-primary/20 ring-2"
                  : "bg-card hover:bg-accent text-foreground",
              )}
            >
              <Icon className="size-5" />
              {PAYMENT_METHOD_LABEL[method]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Received and change, for cash only. Nothing here is stored: the sale records
 * what it charged, not the note the customer handed over.
 */
export function CashReceived({
  value,
  onChange,
  total,
  currency,
}: {
  value: string;
  onChange: (value: string) => void;
  total: string | null;
  currency: Currency;
}) {
  const change = total === null ? null : cashChange(value, total, currency);

  return (
    <div className="grid grid-cols-2 items-end gap-3">
      <div className="space-y-1.5">
        <label htmlFor="pos-received" className="text-xs font-medium">
          Importe recibido
        </label>
        <input
          id="pos-received"
          value={value}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          onChange={(event) => onChange(event.target.value)}
          className="bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-10 w-full rounded-lg border px-3 text-right text-sm font-medium tabular-nums outline-none focus-visible:ring-3"
        />
      </div>
      <div className="space-y-1.5 text-right" aria-live="polite">
        <span className="text-muted-foreground block text-xs">
          {change?.kind === "short" ? "Falta" : "Vuelto"}
        </span>
        <span
          className={cn(
            "block text-lg font-semibold tabular-nums",
            change?.kind === "short" ? "text-destructive" : "text-foreground",
          )}
        >
          {change ? formatMoney(change.amount, currency) : "—"}
        </span>
      </div>
    </div>
  );
}
