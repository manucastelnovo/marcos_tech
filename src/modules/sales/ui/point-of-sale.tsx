"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { searchProductsAction } from "@/modules/inventory/actions";
import type { ProductSuggestion } from "@/modules/inventory/application/queries";
import { searchCustomersAction } from "@/modules/customers/actions";
import type { CustomerSuggestion } from "@/modules/customers/application/queries";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/modules/cash/domain/cash-movement";
import { computeTotals } from "../domain/sale";
import { createSaleAction } from "../actions";

type Line = {
  productId: string;
  label: string;
  quantity: number;
  unitPrice: string;
  unitCost: string;
  available: number;
  productCurrency: Currency;
};

/**
 * The counter's selling screen, built for speed like the intake screen.
 *
 * Search, add, done. The totals recompute as you type, the margin is visible
 * before the sale is closed, and Ctrl+Enter finishes it without reaching for
 * the mouse.
 */
export function PointOfSale({ hasOpenSession }: { hasOpenSession: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [lines, setLines] = useState<Line[]>([]);
  const [currency, setCurrency] = useState<Currency>("PYG");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerMatches, setCustomerMatches] = useState<CustomerSuggestion[]>([]);
  const [customer, setCustomer] = useState<CustomerSuggestion | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchProductsAction(query);
      if (cancelled) return;
      setIsSearching(false);
      setSuggestions(result.ok ? result.data : []);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (customer || customerQuery.trim().length < 3) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchCustomersAction(customerQuery);
      if (cancelled) return;
      setCustomerMatches(result.ok ? result.data : []);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerQuery, customer]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
    }
  }

  function handleCustomerQueryChange(value: string) {
    setCustomerQuery(value);
    if (value.trim().length < 3) setCustomerMatches([]);
  }

  function addLine(product: ProductSuggestion) {
    setLines((current) => {
      const existing = current.findIndex((line) => line.productId === product.id);
      if (existing >= 0) {
        const next = [...current];
        next[existing] = { ...next[existing], quantity: next[existing].quantity + 1 };
        return next;
      }
      return [
        ...current,
        {
          productId: product.id,
          label: `${product.sku} · ${product.name}`,
          quantity: 1,
          // Left blank so the server uses the list price, converting if the
          // product is priced in another currency.
          unitPrice: "",
          unitCost: product.averageCost,
          available: product.quantity,
          productCurrency: product.currency,
        },
      ];
    });

    setQuery("");
    setSuggestions([]);
    searchRef.current?.focus();
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  // Only lines already priced in the sale's currency can be previewed here. A
  // product in another currency is converted server-side with the frozen rate.
  const previewable = lines.every(
    (line) => line.unitPrice !== "" || line.productCurrency === currency,
  );

  const totals = useMemo(() => {
    if (!previewable) return null;
    try {
      return computeTotals(
        lines.map((line) => ({
          quantity: line.quantity,
          unitPrice: line.unitPrice || "0",
          unitCost: line.productCurrency === currency ? line.unitCost : "0",
        })),
        discount || "0",
        currency,
      );
    } catch {
      return null;
    }
  }, [lines, discount, currency, previewable]);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (lines.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }

    startTransition(async () => {
      const result = await createSaleAction({
        customerId: customer?.id ?? "",
        currency,
        method,
        discount,
        notes,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`Venta ${result.data.number} registrada`);
      router.push(`/ventas/${result.data.saleId}`);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={handleKeyDown} className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Input
                ref={searchRef}
                value={query}
                autoFocus
                autoComplete="off"
                placeholder="Buscar por código o nombre"
                onChange={(event) => handleQueryChange(event.target.value)}
              />
              {isSearching ? (
                <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
              ) : null}
            </div>

            {suggestions.length > 0 ? (
              <ul className="max-h-56 overflow-auto rounded-md border">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      className="hover:bg-accent/60 flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
                      onClick={() => addLine(suggestion)}
                    >
                      <Plus className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {suggestion.sku} · {suggestion.name}
                        </span>
                        <span
                          className={cn(
                            "text-xs",
                            suggestion.quantity <= 0 ? "text-red-700" : "text-muted-foreground",
                          )}
                        >
                          {suggestion.quantity} en stock
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {lines.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Buscá un producto para empezar la venta.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left text-xs">
                    <th className="pb-1">Producto</th>
                    <th className="w-20 pb-1">Cant.</th>
                    <th className="w-32 pb-1">Precio</th>
                    <th className="w-10 pb-1" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.productId} className="border-t">
                      <td className="py-2">
                        <div className="truncate">{line.label}</div>
                        {line.quantity > line.available ? (
                          <div className="text-xs text-amber-700">
                            Solo hay {line.available} en stock
                          </div>
                        ) : null}
                        {line.productCurrency !== currency ? (
                          <div className="text-muted-foreground text-xs">
                            Se convierte desde {line.productCurrency}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <Input
                          value={String(line.quantity)}
                          inputMode="numeric"
                          className="h-8"
                          onChange={(event) =>
                            updateLine(index, {
                              quantity: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1),
                            })
                          }
                        />
                      </td>
                      <td className="py-2">
                        <Input
                          value={line.unitPrice}
                          inputMode="decimal"
                          className="h-8"
                          placeholder="lista"
                          onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                        />
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Quitar"
                          onClick={() => removeLine(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cliente (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {customer ? (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span>{customer.fullName}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCustomer(null)}>
                  Quitar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  value={customerQuery}
                  autoComplete="off"
                  placeholder="Teléfono o nombre"
                  onChange={(event) => handleCustomerQueryChange(event.target.value)}
                />
                {customerMatches.length > 0 ? (
                  <ul className="max-h-40 overflow-auto rounded-md border">
                    {customerMatches.map((match) => (
                      <li key={match.id}>
                        <button
                          type="button"
                          className="hover:bg-accent/60 w-full px-3 py-2 text-left text-sm"
                          onClick={() => {
                            setCustomer(match);
                            setCustomerMatches([]);
                          }}
                        >
                          {match.fullName}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Cobro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasOpenSession ? (
              <Alert className="border-amber-400 bg-amber-50">
                <TriangleAlert className="size-4" />
                <AlertDescription>
                  No hay caja abierta. La venta se registra igual, pero no va a entrar al arqueo.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="saleCurrency">Moneda</Label>
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (value) setCurrency(value as Currency);
                }}
              >
                <SelectTrigger id="saleCurrency">
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

            <div className="space-y-2">
              <Label htmlFor="saleMethod">Forma de pago</Label>
              <Select
                value={method}
                onValueChange={(value) => {
                  if (value) setMethod(value as PaymentMethod);
                }}
              >
                <SelectTrigger id="saleMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PAYMENT_METHOD_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="saleDiscount">Descuento</Label>
              <Input
                id="saleDiscount"
                value={discount}
                inputMode="decimal"
                placeholder="0"
                onChange={(event) => setDiscount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="saleNotes">Nota</Label>
              <Input
                id="saleNotes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Liquidación, cliente frecuente"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {totals ? (
              <>
                <Row label="Subtotal">{formatMoney(totals.subtotal, currency)}</Row>
                <Row label="Descuento">{formatMoney(totals.discount, currency)}</Row>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-medium">Total</span>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatMoney(totals.total, currency)}
                  </span>
                </div>
                <Row label="Ganancia estimada">
                  <span className={totals.belowCost ? "text-red-700" : "text-emerald-700"}>
                    {formatMoney(totals.margin, currency)}
                  </span>
                </Row>
                {totals.belowCost ? (
                  <p className="text-xs text-red-700">
                    Estás vendiendo por debajo del costo. Se puede, queda registrado.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">
                El total se calcula al confirmar, porque hay productos en otra moneda.
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isPending}>
              {isPending ? "Registrando..." : "Cerrar venta"}
            </Button>
            <p className="text-muted-foreground text-center text-xs">Ctrl + Enter</p>
          </CardContent>
        </Card>
      </div>
    </form>
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
