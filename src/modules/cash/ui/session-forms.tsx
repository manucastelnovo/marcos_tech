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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import {
  CASH_MOVEMENT_LABEL,
  MANUAL_MOVEMENT_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  expectedSign,
  type CashMovementType,
} from "../domain/cash-movement";
import type { CurrencyLine } from "../domain/reconciliation";
import {
  closeCashSessionAction,
  openCashSessionAction,
  registerCashMovementAction,
} from "../actions";
import {
  CurrencyCountFields,
  toCountsPayload,
  type CountValues,
} from "./currency-count-fields";

export function OpenSessionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [counts, setCounts] = useState<CountValues>({});
  const [notes, setNotes] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await openCashSessionAction({ counts: toCountsPayload(counts), notes });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Caja abierta");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Contá lo que hay en el cajón ahora, moneda por moneda. Lo que dejes en blanco se toma
        como que no hay.
      </p>

      <CurrencyCountFields values={counts} onChange={setCounts} idPrefix="open" />

      <div className="space-y-2">
        <Label htmlFor="openNotes">Nota (opcional)</Label>
        <Input
          id="openNotes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Turno mañana"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Abriendo..." : "Abrir caja"}
      </Button>
    </form>
  );
}

/**
 * Closing asks for one count per currency and shows the difference before
 * anything is committed. A difference never blocks the close: forcing the
 * numbers to agree would only teach people to invent a count.
 */
export function CloseSessionForm({
  sessionId,
  lines,
}: {
  sessionId: string;
  lines: CurrencyLine[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [counts, setCounts] = useState<CountValues>({});
  const [notes, setNotes] = useState("");

  const inPlay = lines.map((line) => line.currency);

  const preview = lines.map((line) => {
    const typed = (counts[line.currency] ?? "").trim();
    if (typed === "") return { ...line, counted: null, difference: null };
    const countedNumber = Number(typed.replace(/[.\s]/g, "").replace(",", "."));
    if (!Number.isFinite(countedNumber)) return { ...line, counted: null, difference: null };
    const difference = countedNumber - Number(line.expected);
    return { ...line, counted: String(countedNumber), difference: String(difference) };
  });

  const offBy = preview.filter(
    (line) => line.difference !== null && Number(line.difference) !== 0,
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await closeCashSessionAction({
        sessionId,
        counts: toCountsPayload(counts),
        notes,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Caja cerrada");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hubo movimientos en efectivo. Podés cerrar directamente.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left text-xs">
                <th className="pb-1">Moneda</th>
                <th className="pb-1 text-right">Esperado</th>
                <th className="pb-1 text-right">Contado</th>
                <th className="pb-1 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((line) => (
                <tr key={line.currency} className="border-t">
                  <td className="py-1.5">{CURRENCY_LABEL[line.currency]}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatMoney(line.expected, line.currency)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {line.counted === null ? "—" : formatMoney(line.counted, line.currency)}
                  </td>
                  <td
                    className={cn(
                      "py-1.5 text-right font-medium tabular-nums",
                      line.difference === null
                        ? "text-muted-foreground"
                        : Number(line.difference) === 0
                          ? "text-emerald-700"
                          : "text-red-700",
                    )}
                  >
                    {line.difference === null
                      ? "—"
                      : formatMoney(line.difference, line.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CurrencyCountFields
        values={counts}
        onChange={setCounts}
        idPrefix="close"
        highlight={inPlay}
      />

      {offBy.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Hay diferencia</AlertTitle>
          <AlertDescription>
            Podés cerrar igual. La diferencia queda registrada con tu nombre y la hora, para
            que se pueda revisar después.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="closeNotes">Nota del cierre</Label>
        <Input
          id="closeNotes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Faltaron 50.000, se descuenta del turno"
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Cerrando..." : "Cerrar caja"}
      </Button>
    </form>
  );
}

/** Expenses, withdrawals, refunds and corrections. */
export function MovementForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<CashMovementType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("PYG");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CASH");
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [description, setDescription] = useState("");

  const needsDirection = expectedSign(type) === "ANY";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await registerCashMovementAction({
        type,
        amount,
        currency,
        method,
        description,
        direction: needsDirection ? direction : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAmount("");
      setDescription("");
      toast.success("Movimiento registrado");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="movementType">Tipo</Label>
          <Select
            value={type}
            onValueChange={(value) => {
              if (value) setType(value as CashMovementType);
            }}
          >
            <SelectTrigger id="movementType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MANUAL_MOVEMENT_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {CASH_MOVEMENT_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="movementAmount">Monto</Label>
          <Input
            id="movementAmount"
            value={amount}
            inputMode="decimal"
            placeholder="150.000"
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">Siempre en positivo.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="movementCurrency">Moneda</Label>
          <Select
            value={currency}
            onValueChange={(value) => {
              if (value) setCurrency(value as Currency);
            }}
          >
            <SelectTrigger id="movementCurrency">
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
          <Label htmlFor="movementMethod">Forma</Label>
          <Select
            value={method}
            onValueChange={(value) => {
              if (value) setMethod(value as (typeof PAYMENT_METHODS)[number]);
            }}
          >
            <SelectTrigger id="movementMethod">
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
          <p className="text-muted-foreground text-xs">
            Solo el efectivo afecta lo que tiene que haber en el cajón.
          </p>
        </div>
      </div>

      {needsDirection ? (
        <div className="space-y-2">
          <Label>Dirección</Label>
          <div className="flex gap-2">
            {(["IN", "OUT"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDirection(option)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  direction === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {option === "IN" ? "Suma al cajón" : "Resta del cajón"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="movementDescription">Descripción</Label>
        <Input
          id="movementDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Compra de insumos, retiro del dueño"
        />
      </div>

      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Registrando..." : "Registrar movimiento"}
      </Button>
    </form>
  );
}
