"use client";

import { Loader2, ScanBarcode, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRODUCT_CATEGORY_LABEL,
  type ProductCategory,
} from "@/modules/inventory/domain/product";

type ProductSearchProps = {
  ref: React.Ref<HTMLInputElement>;
  value: string;
  isSearching: boolean;
  onChange: (value: string) => void;
  /** Enter: add the exact match, which is what a barcode scanner sends. */
  onSubmit: () => void;
};

export function ProductSearch({
  ref,
  value,
  isSearching,
  onChange,
  onSubmit,
}: ProductSearchProps) {
  return (
    <div className="relative">
      <label htmlFor="pos-search" className="sr-only">
        Buscar producto
      </label>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2" />
      <input
        ref={ref}
        id="pos-search"
        type="search"
        value={value}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Buscar producto, código o IMEI..."
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          } else if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 h-12 w-full rounded-lg border pr-24 pl-11 text-base shadow-xs outline-none focus-visible:ring-3 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
        {isSearching ? (
          <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Buscando" />
        ) : value ? (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground rounded p-0.5"
          >
            <X className="size-4" />
          </button>
        ) : (
          <ScanBarcode className="text-muted-foreground size-4" aria-hidden />
        )}
        <kbd className="text-muted-foreground bg-muted hidden rounded border px-1.5 py-0.5 font-sans text-[11px] md:inline">
          Ctrl K
        </kbd>
      </div>
    </div>
  );
}

export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: ProductCategory[];
  value: ProductCategory | null;
  onChange: (value: ProductCategory | null) => void;
}) {
  if (categories.length < 2) return null;

  const options: Array<{ key: ProductCategory | null; label: string }> = [
    { key: null, label: "Todos" },
    ...categories
      .map((category) => ({ key: category, label: PRODUCT_CATEGORY_LABEL[category] }))
      .sort((a, b) => a.label.localeCompare(b.label, "es")),
  ];

  return (
    <div
      role="group"
      aria-label="Filtrar por categoría"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <button
            key={option.key ?? "all"}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.key)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
