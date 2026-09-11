"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { consumePartAction, removePartAction, searchProductsAction } from "../actions";
import type { ProductSuggestion, RepairPartEntry } from "../application/queries";

/**
 * Where a repair records what it actually consumed.
 *
 * Picking from stock moves the ledger and freezes the cost. The manual option
 * exists because parts get bought mid-job or scavenged, and a system that
 * cannot record that stops being used.
 */
export function RepairPartsBlock({
  repairId,
  repairCurrency,
  parts,
  partsCost,
  canEdit,
}: {
  repairId: string;
  repairCurrency: Currency;
  parts: RepairPartEntry[];
  partsCost: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"stock" | "manual">("stock");

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<ProductSuggestion | null>(null);
  const [serialId, setSerialId] = useState("");

  const [description, setDescription] = useState("");
  const [manualCost, setManualCost] = useState("");
  const [quantity, setQuantity] = useState("1");

  // Clearing happens in the change handler, not here.
  useEffect(() => {
    if (selected || query.trim().length < 2) return;

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
  }, [query, selected]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
    }
  }

  function reset() {
    setQuery("");
    setSuggestions([]);
    setSelected(null);
    setSerialId("");
    setDescription("");
    setManualCost("");
    setQuantity("1");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await consumePartAction({
        repairId,
        productId: mode === "stock" ? (selected?.id ?? "") : "",
        description: mode === "manual" ? description : "",
        unitCost: mode === "manual" ? manualCost : "",
        serialId: mode === "stock" ? serialId : "",
        quantity,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      reset();
      toast.success("Repuesto registrado");
      router.refresh();
    });
  }

  function remove(part: RepairPartEntry) {
    const reason = window.prompt("¿Por qué se quita este repuesto?");
    if (!reason || reason.trim().length < 3) return;

    startTransition(async () => {
      const result = await removePartAction({ repairPartId: part.id, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Repuesto quitado");
      router.refresh();
    });
  }

  const canSubmit =
    mode === "stock" ? Boolean(selected) : description.trim().length >= 2;

  return (
    <div className="space-y-4">
      {parts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no se registró ningún repuesto en esta orden.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {parts.map((part) => (
            <li key={part.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{part.description}</div>
                <div className="text-muted-foreground text-xs">
                  {part.quantity} × {formatMoney(part.unitCost, part.currency)}
                  {part.serial ? ` · serie ${part.serial}` : ""}
                  {part.productId ? "" : " · sin descontar stock"}
                  {` · ${part.addedByName}`}
                </div>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar repuesto"
                  disabled={isPending}
                  onClick={() => remove(part)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {Object.keys(partsCost).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(partsCost).map(([currency, total]) => (
            <div
              key={currency}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Costo real de repuestos:{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(total, currency as Currency)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {!canEdit ? null : (
        <>
          <Separator />
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              {(["stock", "manual"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    mode === option
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  {option === "stock" ? "Del stock" : "Sin stock"}
                </button>
              ))}
            </div>

            {mode === "stock" ? (
              selected ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {selected.sku} · {selected.name}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {selected.quantity} en stock ·{" "}
                        {formatMoney(selected.averageCost, selected.currency)} por unidad
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={reset}>
                      Cambiar
                    </Button>
                  </div>

                  {selected.tracksSerial ? (
                    <div className="space-y-2">
                      <Label htmlFor="partSerial">Número de serie</Label>
                      <Select
                        value={serialId || "none"}
                        onValueChange={(value) => setSerialId(!value || value === "none" ? "" : value)}
                      >
                        <SelectTrigger id="partSerial">
                          <SelectValue placeholder="Sin especificar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin especificar</SelectItem>
                          {selected.availableSerials.map((serial) => (
                            <SelectItem key={serial.id} value={serial.id}>
                              {serial.serial}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="partSearch">Buscar repuesto</Label>
                  <div className="relative">
                    <Input
                      id="partSearch"
                      value={query}
                      autoComplete="off"
                      placeholder="Código, nombre o modelo compatible"
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
                            className="hover:bg-accent/60 flex w-full flex-col items-start px-3 py-2 text-left text-sm"
                            onClick={() => {
                              setSelected(suggestion);
                              setSuggestions([]);
                            }}
                          >
                            <span className="font-medium">
                              {suggestion.sku} · {suggestion.name}
                            </span>
                            <span
                              className={cn(
                                "text-xs",
                                suggestion.quantity <= 0
                                  ? "text-red-700"
                                  : "text-muted-foreground",
                              )}
                            >
                              {suggestion.quantity} en stock ·{" "}
                              {formatMoney(suggestion.averageCost, suggestion.currency)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="partDescription">Repuesto usado</Label>
                  <Input
                    id="partDescription"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Pin de carga comprado en el momento"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partManualCost">Costo por unidad</Label>
                  <Input
                    id="partManualCost"
                    value={manualCost}
                    inputMode="decimal"
                    placeholder="120.000"
                    onChange={(event) => setManualCost(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    En {repairCurrency}. No descuenta stock.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-end gap-3">
              <div className="w-28 space-y-2">
                <Label htmlFor="partQuantity">Cantidad</Label>
                <Input
                  id="partQuantity"
                  value={quantity}
                  inputMode="numeric"
                  onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button type="submit" disabled={isPending || !canSubmit}>
                <PackagePlus className="size-4" />
                {isPending ? "Guardando..." : "Agregar repuesto"}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
