"use client";

import { useState, useTransition } from "react";
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
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABEL,
  type ProductCategory,
} from "../domain/product";
import { createProductAction, updateProductAction } from "../actions";

export type ProductFormValues = {
  sku: string;
  name: string;
  category: ProductCategory;
  compatibility: string;
  currency: Currency;
  salePrice: string;
  minStock: string;
  location: string;
  tracksSerial: boolean;
};

const EMPTY: ProductFormValues = {
  sku: "",
  name: "",
  category: "SCREEN",
  compatibility: "",
  currency: "PYG",
  salePrice: "",
  minStock: "0",
  location: "",
  tracksSerial: false,
};

export function ProductForm({
  productId,
  initial,
}: {
  productId?: string;
  initial?: ProductFormValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<ProductFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const payload = { ...form, ...(productId ? { productId } : {}) };
      const result = productId
        ? await updateProductAction(payload)
        : await createProductAction(payload);

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(productId ? "Producto actualizado" : "Producto creado");
      if (productId) {
        router.refresh();
      } else {
        router.push("/stock");
      }
    });
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <Field
        id="sku"
        label="Código / SKU"
        value={form.sku}
        onChange={(value) => set("sku", value.toUpperCase())}
        placeholder="PANT-IP13"
        error={fieldError("sku")}
      />
      <Field
        id="name"
        label="Nombre"
        value={form.name}
        onChange={(value) => set("name", value)}
        placeholder="Pantalla iPhone 13 OLED"
        error={fieldError("name")}
      />

      <div className="space-y-2">
        <Label htmlFor="category">Categoría</Label>
        <Select
          value={form.category}
          onValueChange={(value) => {
            if (value) set("category", value as ProductCategory);
          }}
        >
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {PRODUCT_CATEGORY_LABEL[category]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Field
        id="compatibility"
        label="Compatible con"
        value={form.compatibility}
        onChange={(value) => set("compatibility", value)}
        placeholder="iPhone 13 / 13 Pro"
      />

      <div className="space-y-2">
        <Label htmlFor="currency">Moneda</Label>
        <Select
          value={form.currency}
          onValueChange={(value) => {
            if (value) set("currency", value as Currency);
          }}
        >
          <SelectTrigger id="currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {CURRENCY_LABEL[currency]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          En esta moneda se carga el costo y el precio de este producto.
        </p>
      </div>

      <Field
        id="salePrice"
        label="Precio de venta"
        value={form.salePrice}
        onChange={(value) => set("salePrice", value)}
        placeholder="450.000"
        error={fieldError("salePrice")}
      />
      <Field
        id="minStock"
        label="Stock mínimo"
        value={form.minStock}
        onChange={(value) => set("minStock", value.replace(/\D/g, ""))}
        placeholder="2"
        error={fieldError("minStock")}
      />
      <Field
        id="location"
        label="Ubicación en el local"
        value={form.location}
        onChange={(value) => set("location", value)}
        placeholder="Estante A, caja 3"
      />

      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          checked={form.tracksSerial}
          onChange={(event) => set("tracksSerial", event.target.checked)}
          className="size-4"
        />
        Llevar número de serie por unidad
      </label>

      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : productId ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
