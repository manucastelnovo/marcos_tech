"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Money, type Currency } from "@/shared/domain/money";
import type { PaymentMethod } from "@/modules/cash/domain/cash-movement";
import type { ProductCategory } from "@/modules/inventory/domain/product";
import {
  addToCart,
  previewCart,
  repriceLines,
  resolveDiscount,
  toSalePayload,
  type CartLine,
  type DiscountMode,
  type Rates,
} from "../domain/cart";
import { normalizeInvoiceNumber } from "../domain/sale";
import type { SellableProduct } from "../application/catalog";
import { createSaleAction, searchCatalogAction } from "../actions";
import { CategoryChips, ProductSearch } from "./pos/product-search";
import { ProductGrid, type GridState } from "./pos/product-grid";
import { Cart } from "./pos/cart";
import { CustomerPicker, type PickedCustomer } from "./pos/customer-picker";
import { CashStatusBlock, type PosCashStatus } from "./pos/cash-status";
import { CashReceived, PaymentMethods } from "./pos/payment-methods";
import { SaleOptions, SaleTotalsPanel } from "./pos/sale-summary";

const MIN_QUERY = 2;

/**
 * The counter's selling screen.
 *
 * Search on the left, ticket on the right. Business rules stay where they
 * were: the server validates, prices, converts and records; this component
 * only previews what the server will do and sends the same payload as before.
 *
 * Keyboard: Ctrl+K search, F2 customer, Enter adds an exact code (barcode
 * scanners type the code and press Enter), Ctrl+Enter confirms.
 */
export function PointOfSale({
  rates,
  cash,
  categories,
  featured,
  canCreateCustomer,
}: {
  rates: Rates;
  cash: PosCashStatus;
  categories: ProductCategory[];
  featured: SellableProduct[];
  canCreateCustomer: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // useTransition alone leaves a gap between the click and the pending flag.
  // A ref closes it, so a double click can never send two sales.
  const submittingRef = useRef(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [currency, setCurrency] = useState<Currency>("PYG");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [discountMode, setDiscountMode] = useState<DiscountMode>("amount");
  const [discount, setDiscount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ProductCategory | null>(null);
  const [results, setResults] = useState<SellableProduct[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const requestRef = useRef(0);

  const isBrowsing = query.trim().length < MIN_QUERY && category === null;

  useEffect(() => {
    if (isBrowsing) return;

    const request = ++requestRef.current;
    const trimmed = query.trim();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchCatalogAction({
        query: trimmed.length >= MIN_QUERY ? trimmed : undefined,
        category: category ?? undefined,
      });
      if (request !== requestRef.current) return;
      setIsSearching(false);
      setResults(result.ok ? result.data : []);
      if (!result.ok) toast.error(result.error);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, category, isBrowsing]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < MIN_QUERY && category === null) {
      requestRef.current += 1;
      setResults(null);
      setIsSearching(false);
    }
  }

  function handleCategoryChange(value: ProductCategory | null) {
    setCategory(value);
    setResults(null);
    if (value === null && query.trim().length < MIN_QUERY) {
      requestRef.current += 1;
      setIsSearching(false);
    }
  }

  const gridState: GridState = isBrowsing
    ? featured.length > 0
      ? { kind: "results", products: featured }
      : { kind: "empty-catalog" }
    : results === null
      ? { kind: "loading" }
      : results.length === 0
        ? { kind: "empty-search" }
        : { kind: "results", products: results };

  const gridTitle = isBrowsing
    ? "Más vendidos"
    : query.trim().length >= MIN_QUERY
      ? "Resultados"
      : "Productos de la categoría";

  const inCart = useMemo(
    () => new Map(lines.map((line) => [line.productId, line.quantity])),
    [lines],
  );

  function add(product: SellableProduct) {
    const current = inCart.get(product.id) ?? 0;
    setLines((existing) => addToCart(existing, product, currency, rates));
    setError(null);
    setAnnouncement(`${product.name} agregado. ${current + 1} en el carrito.`);

    if (current + 1 > product.quantity) {
      toast.warning(
        product.quantity <= 0
          ? `${product.name} no tiene stock registrado`
          : `Solo hay ${product.quantity} de ${product.name} en stock`,
      );
    }
  }

  /** Enter in the search box: add when the match is unambiguous. */
  async function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    const request = ++requestRef.current;
    setIsSearching(true);
    const result = await searchCatalogAction({ query: trimmed });
    if (request !== requestRef.current) return;
    setIsSearching(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const upper = trimmed.toUpperCase();
    const match =
      result.data.find((product) => product.sku.toUpperCase() === upper) ??
      (result.data.length === 1 ? result.data[0] : null);

    if (match) {
      add(match);
      handleQueryChange("");
      searchRef.current?.focus();
      return;
    }

    setCategory(null);
    setResults(result.data);
    toast.info(
      result.data.length > 1
        ? "Hay varios productos. Elegí uno de la lista."
        : `No encontramos "${trimmed}"`,
    );
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setLines((existing) =>
      existing.map((line) => (line.productId === productId ? { ...line, ...patch } : line)),
    );
    setError(null);
  }

  function removeLine(productId: string) {
    const removed = lines.find((line) => line.productId === productId);
    setLines((existing) => existing.filter((line) => line.productId !== productId));
    if (removed) setAnnouncement(`${removed.name} quitado del carrito.`);
  }

  function changeCurrency(next: Currency) {
    if (next === currency) return;
    setLines((existing) => repriceLines(existing, currency, next, rates));
    // An amount typed in the old currency means nothing in the new one.
    if (discountMode === "amount") setDiscount("");
    setReceived("");
    setCurrency(next);
  }

  function handleInvoiceBlur() {
    const trimmed = invoiceNumber.trim();
    if (!trimmed) {
      setInvoiceError(null);
      return;
    }
    const normalized = normalizeInvoiceNumber(trimmed);
    if (normalized) {
      setInvoiceNumber(normalized);
      setInvoiceError(null);
    } else {
      setInvoiceError("Formato: 001-002-0000004");
    }
  }

  // The subtotal before discount, which a percentage is taken from.
  const basePreview = previewCart(lines, "0", currency, rates);

  const resolvedDiscount = basePreview
    ? resolveDiscount(discountMode, discount, basePreview.totals.subtotal, currency)
    : null;

  const preview = resolvedDiscount?.ok
    ? previewCart(lines, resolvedDiscount.amount, currency, rates)
    : basePreview;

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (submittingRef.current || isPending) return;

    if (lines.length === 0) {
      setError("Agregá al menos un producto");
      searchRef.current?.focus();
      return;
    }
    if (!basePreview || !resolvedDiscount) {
      setError("Hay productos sin precio o con un precio inválido");
      return;
    }
    if (!resolvedDiscount.ok) {
      setError(resolvedDiscount.error);
      document.getElementById("pos-discount")?.focus();
      return;
    }
    if (preview && Money.of(preview.totals.total, currency).isNegative()) {
      setError("El descuento no puede superar el total de la venta");
      document.getElementById("pos-discount")?.focus();
      return;
    }
    if (invoiceNumber.trim() && !normalizeInvoiceNumber(invoiceNumber)) {
      setInvoiceError("Formato: 001-002-0000004");
      document.getElementById("pos-invoice")?.focus();
      return;
    }

    setError(null);
    submittingRef.current = true;

    startTransition(async () => {
      try {
        const result = await createSaleAction(
          toSalePayload({
            lines,
            customerId: customer?.id ?? null,
            currency,
            method,
            discount: resolvedDiscount.amount,
            notes,
            invoiceNumber,
          }),
        );

        if (!result.ok) {
          const firstField = result.fieldErrors ? Object.values(result.fieldErrors)[0]?.[0] : null;
          setError(firstField ?? result.error);
          toast.error(firstField ?? result.error);
          submittingRef.current = false;
          return;
        }

        toast.success(`Venta ${result.data.number} registrada`, {
          description: result.data.belowCost ? "Quedó registrada por debajo del costo." : undefined,
        });
        // The flag stays set: this screen is on its way out and must not send
        // the same cart again.
        router.push(`/ventas/${result.data.saleId}`);
      } catch {
        submittingRef.current = false;
        setError("No se pudo registrar la venta. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    } else if (event.key === "F2") {
      event.preventDefault();
      customerRef.current?.focus();
    } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <form
      onSubmit={submit}
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:gap-6"
    >
      <h1 className="sr-only">Nueva venta</h1>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="bg-card min-w-0 space-y-4 rounded-xl border p-4 shadow-xs lg:p-5">
        <ProductSearch
          ref={searchRef}
          value={query}
          isSearching={isSearching}
          onChange={handleQueryChange}
          onSubmit={submitSearch}
        />
        <CategoryChips categories={categories} value={category} onChange={handleCategoryChange} />
        <ProductGrid title={gridTitle} state={gridState} inCart={inCart} onAdd={add} />
      </div>

      <aside
        aria-label="Venta actual"
        className="bg-card flex flex-col rounded-xl border shadow-xs lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)]"
      >
        <div className="space-y-5 p-4 lg:overflow-y-auto">
          <Cart
            lines={lines}
            currency={currency}
            rates={rates}
            onQuantity={(productId, quantity) => updateLine(productId, { quantity })}
            onPrice={(productId, unitPrice) => updateLine(productId, { unitPrice })}
            onRemove={removeLine}
          />
          <CustomerPicker
            ref={customerRef}
            value={customer}
            onChange={setCustomer}
            canCreate={canCreateCustomer}
          />
          <CashStatusBlock status={cash} />
          <PaymentMethods value={method} onChange={setMethod} />
          {method === "CASH" ? (
            <CashReceived
              value={received}
              onChange={setReceived}
              total={preview?.totals.total ?? null}
              currency={currency}
            />
          ) : null}
          <SaleOptions
            currency={currency}
            onCurrency={changeCurrency}
            discountMode={discountMode}
            onDiscountMode={(mode) => {
              setDiscountMode(mode);
              setDiscount("");
            }}
            discount={discount}
            onDiscount={(value) => {
              setDiscount(value);
              setError(null);
            }}
            discountError={resolvedDiscount && !resolvedDiscount.ok ? resolvedDiscount.error : null}
            discountAmount={resolvedDiscount?.ok ? resolvedDiscount.amount : null}
            invoiceNumber={invoiceNumber}
            onInvoiceNumber={(value) => {
              setInvoiceNumber(value);
              setInvoiceError(null);
            }}
            onInvoiceBlur={handleInvoiceBlur}
            invoiceError={invoiceError}
            notes={notes}
            onNotes={setNotes}
          />
        </div>

        <div className="bg-card rounded-b-xl border-t p-4">
          <SaleTotalsPanel
            preview={preview}
            currency={currency}
            hasLines={lines.length > 0}
            isPending={isPending}
            error={error}
          />
        </div>
      </aside>
    </form>
  );
}
