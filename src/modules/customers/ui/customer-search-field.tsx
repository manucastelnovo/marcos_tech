"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPhone } from "../domain/phone";
import { searchCustomersAction } from "../actions";
import type { CustomerSuggestion } from "../application/queries";

export type SelectedCustomer = { id: string; fullName: string; phone: string };

/**
 * The entry point of the intake screen.
 *
 * Typing a phone number searches existing customers. Picking one fills the rest
 * and shows their history; typing a number nobody has reveals the name field so
 * the customer is created together with the repair, in one screen and one
 * transaction.
 */
export function CustomerSearchField({
  phone,
  onPhoneChange,
  selected,
  onSelect,
  onClear,
  error,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  selected: SelectedCustomer | null;
  onSelect: (customer: CustomerSuggestion) => void;
  onClear: () => void;
  error?: string;
}) {
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clearing lives in the change handler, not here: a synchronous setState in
  // an effect body cascades renders.
  useEffect(() => {
    if (selected || phone.trim().length < 3) return;

    let cancelled = false;

    // Debounced: the counter types fast and every keystroke is a round trip.
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchCustomersAction(phone);
      if (cancelled) return;
      setIsSearching(false);
      if (result.ok) {
        setSuggestions(result.data);
        setIsOpen(result.data.length > 0);
        setHighlighted(0);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, selected]);

  function handlePhoneChange(value: string) {
    onPhoneChange(value);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onSelect(suggestions[highlighted]);
      setIsOpen(false);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  if (selected) {
    return (
      <div className="space-y-2">
        <Label>Cliente</Label>
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <Check className="size-4 shrink-0 text-emerald-600" />
              <span className="truncate">{selected.fullName}</span>
            </div>
            <div className="text-muted-foreground text-sm">{formatPhone(selected.phone)}</div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label="Cambiar cliente">
            <X className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor="customerPhone">Teléfono del cliente</Label>
      <div className="relative">
        <Input
          id="customerPhone"
          value={phone}
          onChange={(event) => handlePhoneChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(suggestions.length > 0)}
          placeholder="0981 123456"
          inputMode="tel"
          autoComplete="off"
          autoFocus
          aria-invalid={Boolean(error)}
        />
        {isSearching ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
        ) : null}

        {isOpen ? (
          <ul className="bg-popover absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-md border shadow-md">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                    index === highlighted ? "bg-accent" : "hover:bg-accent/60",
                  )}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => {
                    onSelect(suggestion);
                    setIsOpen(false);
                  }}
                >
                  <span className="font-medium">{suggestion.fullName}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatPhone(suggestion.phone)} · {suggestion.repairCount} reparaciones
                    {suggestion.openRepairCount > 0
                      ? ` · ${suggestion.openRepairCount} abiertas`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!isSearching && phone.trim().length >= 3 && suggestions.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <UserPlus className="size-3.5" />
          Cliente nuevo. Escribí el nombre abajo.
        </p>
      ) : null}
    </div>
  );
}
