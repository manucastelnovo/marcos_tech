"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Currency } from "@/shared/domain/money";
import { formatMoney } from "@/shared/ui/money-text";
import { adjustStockAction, receiveStockAction } from "../actions";

/** Registers a purchase, and the serials that came with it when relevant. */
export function ReceiveStockForm({
  productId,
  currency,
  tracksSerial,
}: {
  productId: string;
  currency: Currency;
  tracksSerial: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [serialsText, setSerialsText] = useState("");

  const serials = useMemo(
    () =>
      serialsText
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    [serialsText],
  );

  const parsedQuantity = Number(quantity) || 0;
  const serialMismatch = tracksSerial && serials.length > 0 && serials.length !== parsedQuantity;

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await receiveStockAction({
        productId,
        quantity,
        unitCost,
        reason,
        serials: tracksSerial ? serials : undefined,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setQuantity("1");
      setUnitCost("");
      setReason("");
      setSerialsText("");
      toast.success("Ingreso registrado");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="receiveQuantity">Cantidad</Label>
          <Input
            id="receiveQuantity"
            value={quantity}
            inputMode="numeric"
            onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receiveUnitCost">Costo por unidad</Label>
          <Input
            id="receiveUnitCost"
            value={unitCost}
            inputMode="decimal"
            placeholder="300.000"
            onChange={(event) => setUnitCost(event.target.value)}
          />
        </div>
      </div>

      {tracksSerial ? (
        <div className="space-y-2">
          <Label htmlFor="receiveSerials">Números de serie</Label>
          <Textarea
            id="receiveSerials"
            rows={3}
            value={serialsText}
            onChange={(event) => setSerialsText(event.target.value)}
            placeholder="Uno por línea"
          />
          <p className={serialMismatch ? "text-destructive text-sm" : "text-muted-foreground text-xs"}>
            {serials.length} de {parsedQuantity} unidades con serie
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="receiveReason">Referencia (opcional)</Label>
        <Input
          id="receiveReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Factura 001-234, proveedor"
        />
      </div>

      <p className="text-muted-foreground text-sm">
        El costo se carga en {formatMoney("0", currency).split(" ")[0]} y recalcula el promedio.
      </p>

      <Button type="submit" disabled={isPending || serialMismatch}>
        {isPending ? "Registrando..." : "Registrar ingreso"}
      </Button>
    </form>
  );
}

/**
 * A manual correction after counting the shelf. The reason is mandatory here
 * and in the schema, because an unexplained adjustment cannot be reviewed later.
 */
export function AdjustStockForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const result = await adjustStockAction({ productId, quantity, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setQuantity("");
      setReason("");
      toast.success("Ajuste registrado");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="adjustQuantity">Ajuste</Label>
        <Input
          id="adjustQuantity"
          value={quantity}
          inputMode="numeric"
          placeholder="-2 o 3"
          onChange={(event) => setQuantity(event.target.value.replace(/[^\d-]/g, ""))}
        />
        <p className="text-muted-foreground text-xs">
          Positivo suma unidades, negativo las descuenta.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adjustReason">Motivo</Label>
        <Input
          id="adjustReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Conteo físico, rotura, faltante"
        />
      </div>

      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Ajustando..." : "Registrar ajuste"}
      </Button>
    </form>
  );
}
