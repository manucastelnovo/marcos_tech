"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES, CURRENCY_LABEL, Money, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import type { CartPreview, DiscountMode } from "../../domain/cart";

const fieldClass =
  "bg-card focus-visible:border-ring focus-visible:ring-ring/30 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 aria-invalid:border-destructive";

export function SaleOptions({
  currency,
  onCurrency,
  discountMode,
  onDiscountMode,
  discount,
  onDiscount,
  discountError,
  discountAmount,
  invoiceNumber,
  onInvoiceNumber,
  onInvoiceBlur,
  invoiceError,
  notes,
  onNotes,
}: {
  currency: Currency;
  onCurrency: (currency: Currency) => void;
  discountMode: DiscountMode;
  onDiscountMode: (mode: DiscountMode) => void;
  discount: string;
  onDiscount: (value: string) => void;
  discountError: string | null;
  /** The amount a percentage resolves to, shown so nobody has to do the math. */
  discountAmount: string | null;
  invoiceNumber: string;
  onInvoiceNumber: (value: string) => void;
  onInvoiceBlur: () => void;
  invoiceError: string | null;
  notes: string;
  onNotes: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="pos-currency" className="text-xs font-medium">
            Moneda
          </label>
          <select
            id="pos-currency"
            value={currency}
            onChange={(event) => onCurrency(event.target.value as Currency)}
            className={fieldClass}
          >
            {CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {CURRENCY_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pos-discount" className="text-xs font-medium">
            Descuento
          </label>
          <div className="flex">
            <input
              id="pos-discount"
              value={discount}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              aria-invalid={Boolean(discountError)}
              aria-describedby="pos-discount-hint"
              onChange={(event) => onDiscount(event.target.value)}
              className={cn(fieldClass, "min-w-0 rounded-r-none text-right tabular-nums")}
            />
            <div role="group" aria-label="Tipo de descuento" className="flex rounded-r-lg border border-l-0">
              {(["amount", "percent"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={discountMode === mode}
                  onClick={() => onDiscountMode(mode)}
                  className={cn(
                    "h-full min-w-9 px-2 text-xs font-semibold last:rounded-r-lg",
                    discountMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {mode === "amount" ? currencyShort(currency) : "%"}
                </button>
              ))}
            </div>
          </div>
          <p id="pos-discount-hint" className="min-h-4 text-xs">
            {discountError ? (
              <span className="text-destructive">{discountError}</span>
            ) : discountMode === "percent" && discountAmount ? (
              <span className="text-muted-foreground">= {formatMoney(discountAmount, currency)}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pos-invoice" className="text-xs font-medium">
          Nº de factura <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <input
          id="pos-invoice"
          value={invoiceNumber}
          inputMode="numeric"
          autoComplete="off"
          placeholder="001-002-0000004"
          aria-invalid={Boolean(invoiceError)}
          aria-describedby="pos-invoice-hint"
          onChange={(event) => onInvoiceNumber(event.target.value)}
          onBlur={onInvoiceBlur}
          className={cn(fieldClass, "font-mono")}
        />
        <p id="pos-invoice-hint" className="text-xs">
          {invoiceError ? (
            <span className="text-destructive">{invoiceError}</span>
          ) : (
            <span className="text-muted-foreground">
              Si entregás factura del talonario, anotá su número.
            </span>
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pos-notes" className="text-xs font-medium">
          Nota <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <input
          id="pos-notes"
          value={notes}
          maxLength={300}
          placeholder="Liquidación, cliente frecuente..."
          onChange={(event) => onNotes(event.target.value)}
          className={fieldClass}
        />
      </div>
    </div>
  );
}

export function SaleTotalsPanel({
  preview,
  currency,
  hasLines,
  isPending,
  error,
}: {
  preview: CartPreview | null;
  currency: Currency;
  hasLines: boolean;
  isPending: boolean;
  error: string | null;
}) {
  const totals = preview?.totals ?? null;

  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{totals ? formatMoney(totals.subtotal, currency) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Descuento</dt>
          <dd className="tabular-nums">
            {totals && !Money.of(totals.discount, currency).isZero() ? "− " : ""}
            {totals ? formatMoney(totals.discount, currency) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t pt-2">
          <dt className="text-base font-semibold">Total</dt>
          <dd className="text-[28px] leading-none font-bold tracking-tight tabular-nums">
            {totals ? formatMoney(totals.total, currency) : hasLines ? "—" : formatMoney("0", currency)}
          </dd>
        </div>
        {totals ? (
          <div className="flex justify-between gap-2 text-xs">
            <dt className="text-muted-foreground">
              Ganancia estimada{preview?.marginKnown ? "" : " (parcial)"}
            </dt>
            <dd
              className={cn(
                "font-medium tabular-nums",
                totals.belowCost ? "text-destructive" : "text-success",
              )}
            >
              {formatMoney(totals.margin, currency)}
            </dd>
          </div>
        ) : hasLines ? (
          <div className="text-muted-foreground text-xs">
            Completá los precios del carrito para ver el total.
          </div>
        ) : null}
      </dl>

      {totals?.belowCost ? (
        <p className="text-destructive flex items-start gap-1.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          Estás vendiendo por debajo del costo. Se puede, y queda registrado.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending || !hasLines}
        aria-describedby="pos-confirm-hint"
        className={cn(
          "bg-primary text-primary-foreground flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] text-base font-semibold shadow-sm transition",
          "hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isPending ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            Registrando venta...
          </>
        ) : (
          "Confirmar venta"
        )}
      </button>
      <p id="pos-confirm-hint" className="text-muted-foreground text-center text-xs">
        {hasLines ? "Ctrl + Enter para confirmar" : "Agregá al menos un producto"}
      </p>
    </div>
  );
}

function currencyShort(currency: Currency): string {
  return currency === "PYG" ? "Gs." : currency;
}
