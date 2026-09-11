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
import { setExchangeRateAction } from "../actions";

/** The guaraní is the base, so it is never quoted against itself. */
const QUOTABLE = CURRENCIES.filter((currency) => currency !== "PYG");

export function ExchangeRateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currency, setCurrency] = useState<Currency>("USD");
  const [rate, setRate] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await setExchangeRateAction({ currency, rate });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRate("");
      toast.success("Cotización registrada");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid items-end gap-3 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="rateCurrency">Moneda</Label>
        <Select
          value={currency}
          onValueChange={(value) => {
            if (value) setCurrency(value as Currency);
          }}
        >
          <SelectTrigger id="rateCurrency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {QUOTABLE.map((option) => (
              <SelectItem key={option} value={option}>
                {CURRENCY_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rateValue">Guaraníes por unidad</Label>
        <Input
          id="rateValue"
          value={rate}
          inputMode="decimal"
          placeholder="7.350"
          onChange={(event) => setRate(event.target.value)}
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Registrar cotización"}
      </Button>
    </form>
  );
}
