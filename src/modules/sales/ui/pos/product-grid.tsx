"use client";

import { Loader2, PackageSearch, Plus, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/ui/money-text";
import { ProductThumbnail } from "@/modules/inventory/ui/product-thumbnail";
import { stockHealth } from "@/modules/inventory/domain/product";
import type { SellableProduct } from "../../application/catalog";

export type GridState =
  | { kind: "loading" }
  | { kind: "empty-search" }
  | { kind: "empty-catalog" }
  | { kind: "results"; products: SellableProduct[] };

export function ProductGrid({
  title,
  state,
  inCart,
  onAdd,
}: {
  title: string;
  state: GridState;
  /** Units of each product already in the cart, for the "added" feedback. */
  inCart: ReadonlyMap<string, number>;
  onAdd: (product: SellableProduct) => void;
}) {
  return (
    <section aria-labelledby="pos-grid-title" className="space-y-3">
      <h2 id="pos-grid-title" className="text-muted-foreground text-sm font-medium">
        {title}
      </h2>

      {state.kind === "loading" ? (
        <div
          role="status"
          className="text-muted-foreground flex items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-sm"
        >
          <Loader2 className="size-4 animate-spin" />
          Buscando productos...
        </div>
      ) : state.kind === "empty-search" ? (
        <EmptyBlock
          icon={<SearchX className="size-6" />}
          title="No encontramos productos"
          hint="Probá con otro nombre, código o IMEI."
        />
      ) : state.kind === "empty-catalog" ? (
        <EmptyBlock
          icon={<PackageSearch className="size-6" />}
          title="Todavía no hay productos para mostrar"
          hint="Buscá por nombre o código, o cargá productos en Stock."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {state.products.map((product) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                inCart={inCart.get(product.id) ?? 0}
                onAdd={() => onAdd(product)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: SellableProduct;
  inCart: number;
  onAdd: () => void;
}) {
  const health = stockHealth(product.quantity, product.minStock);
  const stockTone =
    health === "OK"
      ? "text-success"
      : health === "LOW"
        ? "text-warning"
        : "text-destructive";

  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Agregar ${product.name}`}
      className={cn(
        "group bg-card flex h-full w-full flex-col overflow-hidden rounded-xl border text-left shadow-xs transition",
        "hover:border-primary/50 hover:shadow-sm active:scale-[0.99]",
        inCart > 0 && "border-primary ring-primary/20 ring-2",
      )}
    >
      <div className="relative">
        <ProductThumbnail
          imageUrl={product.imageUrl}
          name={product.name}
          category={product.category}
          sizes="(max-width: 640px) 50vw, 220px"
          className="aspect-[4/3] w-full"
        />
        {inCart > 0 ? (
          <span className="bg-primary text-primary-foreground absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-semibold">
            {inCart} en carrito
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm leading-snug font-medium">{product.name}</span>
        <span className="text-muted-foreground font-mono text-xs">{product.sku}</span>
        <span className={cn("text-xs font-medium", stockTone)}>
          {product.quantity <= 0 ? "Sin stock" : `Stock: ${product.quantity}`}
        </span>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-sm font-semibold tabular-nums">
            {product.salePrice === null
              ? "Sin precio"
              : formatMoney(product.salePrice, product.currency)}
          </span>
          <span className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors">
            <Plus className="size-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

function EmptyBlock({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-8 text-center">
      {icon}
      <p className="text-foreground text-sm font-medium">{title}</p>
      <p className="text-xs">{hint}</p>
    </div>
  );
}
