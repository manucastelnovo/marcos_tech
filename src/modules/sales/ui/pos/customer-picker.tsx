"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCustomerAction, searchCustomersAction } from "@/modules/customers/actions";
import type { CustomerSuggestion } from "@/modules/customers/application/queries";

export type PickedCustomer = { id: string; fullName: string; phone: string };

/**
 * Optional, as it always was. A walk-in sale needs no customer; picking one
 * links the sale to the customer's history.
 */
export function CustomerPicker({
  ref,
  value,
  onChange,
  canCreate,
}: {
  ref: React.Ref<HTMLInputElement>;
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  canCreate: boolean;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CustomerSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (value || query.trim().length < 3) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchCustomersAction(query);
      if (cancelled) return;
      setIsSearching(false);
      setMatches(result.ok ? result.data : []);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value]);

  function handleQueryChange(next: string) {
    setQuery(next);
    if (next.trim().length < 3) {
      setMatches([]);
      setIsSearching(false);
    }
  }

  function pick(customer: PickedCustomer) {
    onChange(customer);
    setQuery("");
    setMatches([]);
    setIsCreating(false);
  }

  return (
    <section aria-labelledby="pos-customer-title" className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 id="pos-customer-title" className="text-sm font-semibold">
          Cliente <span className="text-muted-foreground font-normal">(opcional)</span>
        </h3>
        <kbd className="text-muted-foreground bg-muted hidden rounded border px-1.5 py-0.5 font-sans text-[11px] md:inline">
          F2
        </kbd>
      </div>

      {value ? (
        <div className="bg-accent/60 flex items-center gap-3 rounded-lg border px-3 py-2">
          <UserRound className="text-primary size-5 shrink-0" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{value.fullName}</p>
            <p className="text-muted-foreground text-xs">{value.phone}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
            Cambiar
          </Button>
        </div>
      ) : isCreating ? (
        <NewCustomerForm
          initialQuery={query}
          onCancel={() => setIsCreating(false)}
          onCreated={pick}
        />
      ) : (
        <>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              ref={ref}
              value={query}
              autoComplete="off"
              aria-label="Buscar cliente"
              placeholder="Buscar por nombre o teléfono..."
              className="h-10 pl-9"
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (matches.length === 1) pick(matches[0]);
                }
              }}
            />
            {isSearching ? (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
            ) : null}
          </div>

          {matches.length > 0 ? (
            <ul className="max-h-44 overflow-auto rounded-lg border">
              {matches.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                    onClick={() => pick(match)}
                  >
                    <span className="truncate font-medium">{match.fullName}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{match.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim().length >= 3 && !isSearching ? (
            <p className="text-muted-foreground text-xs">Sin coincidencias.</p>
          ) : null}

          {canCreate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => setIsCreating(true)}
            >
              <UserPlus />
              Nuevo cliente
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

function NewCustomerForm({
  initialQuery,
  onCancel,
  onCreated,
}: {
  initialQuery: string;
  onCancel: () => void;
  onCreated: (customer: PickedCustomer) => void;
}) {
  // Whatever was typed in the search is most likely the name or the phone.
  const looksLikePhone = /^[\d\s+()-]+$/.test(initialQuery.trim());
  const [fullName, setFullName] = useState(looksLikePhone ? "" : initialQuery.trim());
  const [phone, setPhone] = useState(looksLikePhone ? initialQuery.trim() : "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await createCustomerAction({ fullName, phone });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Cliente creado");
      onCreated({ id: result.data.id, fullName: fullName.trim(), phone: phone.trim() });
    });
  }

  // Not a <form>: it sits inside the sale form, and nested forms are invalid.
  return (
    <div
      className="space-y-3 rounded-lg border p-3"
      onKeyDown={(event) => {
        // Enter saves the customer and goes no further: Ctrl+Enter must not
        // confirm the sale while a customer is half typed.
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          save();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p className="text-sm font-medium">Nuevo cliente</p>
      <div className="space-y-1.5">
        <Label htmlFor="pos-new-name">Nombre</Label>
        <Input
          id="pos-new-name"
          value={fullName}
          autoFocus
          aria-invalid={Boolean(errors.fullName)}
          onChange={(event) => setFullName(event.target.value)}
        />
        {errors.fullName ? <p className="text-destructive text-xs">{errors.fullName[0]}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pos-new-phone">Teléfono</Label>
        <Input
          id="pos-new-phone"
          value={phone}
          inputMode="tel"
          aria-invalid={Boolean(errors.phone)}
          onChange={(event) => setPhone(event.target.value)}
        />
        {errors.phone ? <p className="text-destructive text-xs">{errors.phone[0]}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : null}
          Guardar cliente
        </Button>
      </div>
    </div>
  );
}
