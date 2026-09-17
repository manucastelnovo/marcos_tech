"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Money, parseAmountInput, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { costIn, listPriceIn, type CartLine, type Rates } from "../../domain/cart";
import { lineTotal } from "../../domain/sale";

export function Cart({
  lines,
  currency,
  rates,
  onQuantity,
  onPrice,
  onRemove,
}: {
  lines: readonly CartLine[];
  currency: Currency;
  rates: Rates;
  onQuantity: (productId: string, quantity: number) => void;
  onPrice: (productId: string, price: string) => void;
  onRemove: (productId: string) => void;
}) {
  const units = lines.reduce((total, line) => total + line.quantity, 0);

  return (
    <section aria-labelledby="pos-cart-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="pos-cart-title" className="text-base font-semibold">
          Carrito
        </h2>
        {lines.length > 0 ? (
          <span className="text-muted-foreground text-xs">
            {units} {units === 1 ? "unidad" : "unidades"}
          </span>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-3 py-4">
          <ShoppingCart className="size-5 shrink-0" />
          <div>
            <p className="text-foreground text-sm font-medium">Carrito vacío</p>
            <p className="text-xs">Agregá productos para comenzar la venta.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lines.map((line) => (
            <CartRow
              key={line.productId}
              line={line}
              currency={currency}
              rates={rates}
              onQuantity={(quantity) => onQuantity(line.productId, quantity)}
              onPrice={(price) => onPrice(line.productId, price)}
              onRemove={() => onRemove(line.productId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CartRow({
  line,
  currency,
  rates,
  onQuantity,
  onPrice,
  onRemove,
}: {
  line: CartLine;
  currency: Currency;
  rates: Rates;
  onQuantity: (quantity: number) => void;
  onPrice: (price: string) => void;
  onRemove: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // The confirmation step expires on its own, so a stray second click minutes
  // later does not remove anything.
  useEffect(() => {
    if (!confirmingRemove) return;
    const timer = setTimeout(() => setConfirmingRemove(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingRemove]);

  const priceId = `pos-price-${line.productId}`;
  const priceHintId = `${priceId}-hint`;

  let price: Money | null = null;
  let priceInvalid = false;
  try {
    price = parseAmountInput(line.unitPrice, currency);
  } catch {
    priceInvalid = true;
  }
  const missingPrice = !priceInvalid && price === null;
  const subtotal = price ? lineTotal(price.toDecimalString(), line.quantity, currency) : null;

  const listPrice = listPriceIn(line, currency, rates);
  const cost = costIn(line, currency, rates);
  const overStock = line.quantity > line.available;
  const belowCost = price !== null && cost !== null && Money.of(cost, currency).greaterThan(price);

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{line.name}</p>
          <p className="text-muted-foreground font-mono text-xs">{line.sku}</p>
        </div>
        {confirmingRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="bg-destructive text-primary-foreground h-8 shrink-0 rounded-md px-2.5 text-xs font-semibold"
          >
            ¿Quitar?
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Quitar ${line.name}`}
            onClick={() => setConfirmingRemove(true)}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border" role="group" aria-label="Cantidad">
          <button
            type="button"
            aria-label="Restar uno"
            disabled={line.quantity <= 1}
            onClick={() => onQuantity(line.quantity - 1)}
            className="hover:bg-muted flex size-9 items-center justify-center rounded-l-lg disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <input
            value={String(line.quantity)}
            inputMode="numeric"
            aria-label={`Cantidad de ${line.name}`}
            onChange={(event) =>
              onQuantity(Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1))
            }
            className="h-9 w-10 border-x text-center text-sm font-semibold tabular-nums focus-visible:outline-offset-0"
          />
          <button
            type="button"
            aria-label="Sumar uno"
            onClick={() => onQuantity(line.quantity + 1)}
            className="hover:bg-muted flex size-9 items-center justify-center rounded-r-lg"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="relative min-w-0 flex-1">
          <label htmlFor={priceId} className="sr-only">
            Precio unitario de {line.name}
          </label>
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs">
            c/u
          </span>
          <input
            id={priceId}
            value={line.unitPrice}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={priceInvalid || missingPrice}
            aria-describedby={priceHintId}
            onChange={(event) => onPrice(event.target.value)}
            onFocus={(event) => event.target.select()}
            className={cn(
              "bg-card h-9 w-full rounded-lg border pr-2.5 pl-9 text-right text-sm font-medium tabular-nums outline-none",
              "focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-3",
              (priceInvalid || missingPrice) && "border-destructive",
            )}
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 text-xs">
        <p id={priceHintId} className="text-muted-foreground">
          {priceInvalid ? (
            <span className="text-destructive font-medium">Precio inválido</span>
          ) : missingPrice ? (
            <span className="text-destructive font-medium">Cargá el precio</span>
          ) : (
            <>
              Costo {cost === null ? "sin cotización" : formatMoney(cost, currency)}
              {listPrice !== null ? ` · Lista ${formatMoney(listPrice, currency)}` : " · Sin precio de lista"}
            </>
          )}
        </p>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {subtotal === null ? "—" : formatMoney(subtotal, currency)}
        </span>
      </div>

      {overStock ? (
        <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert className="size-3.5 shrink-0" />
          {line.available <= 0
            ? "Sin stock registrado. Se vende igual y el stock queda en negativo."
            : `Solo hay ${line.available} en stock. Se vende igual y el stock queda en negativo.`}
        </p>
      ) : null}

      {belowCost ? (
        <p className="text-destructive flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlert className="size-3.5 shrink-0" />
          Precio por debajo del costo.
        </p>
      ) : null}

      {line.productCurrency !== currency ? (
        <p className="text-muted-foreground text-xs">
          Precio convertido desde {line.productCurrency} con la cotización actual.
        </p>
      ) : null}
    </li>
  );
}
