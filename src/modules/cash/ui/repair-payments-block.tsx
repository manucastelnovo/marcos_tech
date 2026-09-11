"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote } from "lucide-react";
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
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/shared/domain/money";
import { formatDateTime } from "@/shared/domain/datetime";
import { formatMoney } from "@/shared/ui/money-text";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from "../domain/cash-movement";
import type { RepairPaymentEntry } from "../application/queries";
import { payRepairAction } from "../actions";

/**
 * Money taken against a repair.
 *
 * Each payment is its own row, so a deposit today and the balance next week are
 * two facts rather than one number overwritten. Taking money with no register
 * open is allowed and flagged: the cash changed hands either way.
 */
export function RepairPaymentsBlock({
  repairId,
  repairCurrency,
  payments,
  balance,
  hasOpenSession,
  canCharge,
}: {
  repairId: string;
  repairCurrency: Currency;
  payments: RepairPaymentEntry[];
  balance: string | null;
  hasOpenSession: boolean;
  canCharge: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>(repairCurrency);
  const [method, setMethod] = useState<PaymentMethod>("CASH");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await payRepairAction({ repairId, amount, currency, method });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAmount("");
      toast.success("Cobro registrado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no se cobró nada de esta orden.</p>
      ) : (
        <ul className="divide-y text-sm">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center gap-3 py-2">
              <span className="font-semibold tabular-nums">
                {formatMoney(payment.amount, payment.currency)}
              </span>
              <span className="text-muted-foreground">
                {PAYMENT_METHOD_LABEL[payment.method]}
              </span>
              {!payment.insideSession ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                  <AlertTriangle className="size-3" />
                  Sin caja abierta
                </span>
              ) : null}
              <span className="text-muted-foreground ml-auto text-xs">
                {formatDateTime(payment.createdAt)} · {payment.actorName}
              </span>
            </li>
          ))}
        </ul>
      )}

      {balance !== null ? (
        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span>Saldo pendiente</span>
          <span className="font-semibold tabular-nums">
            {formatMoney(balance, repairCurrency)}
          </span>
        </div>
      ) : null}

      {canCharge ? (
        <>
          <Separator />
          {!hasOpenSession ? (
            <p className="text-sm text-amber-800">
              No hay caja abierta. El cobro se registra igual, pero no va a contar para el
              arqueo del cajón hasta que alguien lo concilie.
            </p>
          ) : null}

          <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Monto</Label>
              <Input
                id="paymentAmount"
                value={amount}
                inputMode="decimal"
                placeholder="500.000"
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentCurrency">Moneda</Label>
              <Select
                value={currency}
                onValueChange={(value) => {
                  if (value) setCurrency(value as Currency);
                }}
              >
                <SelectTrigger id="paymentCurrency">
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
              <Label htmlFor="paymentMethod">Forma de pago</Label>
              <Select
                value={method}
                onValueChange={(value) => {
                  if (value) setMethod(value as PaymentMethod);
                }}
              >
                <SelectTrigger id="paymentMethod">
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

            <Button type="submit" disabled={isPending}>
              <Banknote className="size-4" />
              {isPending ? "Cobrando..." : "Cobrar"}
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
