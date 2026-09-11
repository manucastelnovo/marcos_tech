"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { acceptQuoteAction, changeQuoteStatusAction } from "../actions";
import { allowedQuoteTransitions, type QuoteStatus } from "../domain/quote";

/**
 * What the customer answered.
 *
 * Accepting is its own dialog because it opens a work order, and that needs a
 * real customer: the quote may have been written for a walk-in with nothing
 * but a first name.
 */
export function QuoteActions({
  quoteId,
  status,
  hasCustomer,
  customerName,
  customerPhone,
}: {
  quoteId: string;
  status: QuoteStatus;
  hasCustomer: boolean;
  customerName: string | null;
  customerPhone: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const transitions = allowedQuoteTransitions(status).filter((target) => target !== "ACCEPTED");
  const canAccept = allowedQuoteTransitions(status).includes("ACCEPTED");

  function move(target: QuoteStatus) {
    startTransition(async () => {
      const result = await changeQuoteStatusAction({ quoteId, status: target });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Presupuesto actualizado");
      router.refresh();
    });
  }

  if (transitions.length === 0 && !canAccept) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canAccept ? (
        <AcceptDialog
          quoteId={quoteId}
          hasCustomer={hasCustomer}
          customerName={customerName}
          customerPhone={customerPhone}
          disabled={isPending}
        />
      ) : null}

      {transitions.map((target) => (
        <Button
          key={target}
          type="button"
          variant={target === "REJECTED" ? "destructive" : "secondary"}
          disabled={isPending}
          onClick={() => move(target)}
        >
          {target === "REJECTED" ? "Marcar rechazado" : "Volver a pendiente"}
        </Button>
      ))}
    </div>
  );
}

function AcceptDialog({
  quoteId,
  hasCustomer,
  customerName,
  customerPhone,
  disabled,
}: {
  quoteId: string;
  hasCustomer: boolean;
  customerName: string | null;
  customerPhone: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(customerName ?? "");
  const [phone, setPhone] = useState(customerPhone ?? "");

  function confirm() {
    startTransition(async () => {
      const result = await acceptQuoteAction({
        quoteId,
        customerName: name,
        customerPhone: phone,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setIsOpen(false);
      toast.success(`Orden ${result.data.orderNumber} creada`);
      router.push(`/reparaciones/${result.data.repairId}`);
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>
        Aceptar y abrir orden
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceptar presupuesto</DialogTitle>
          <DialogDescription>
            Se crea la orden de trabajo con los precios de este presupuesto.
          </DialogDescription>
        </DialogHeader>

        {hasCustomer ? (
          <p className="text-sm">El cliente ya está cargado. Solo confirmá.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="acceptName">Nombre del cliente</Label>
              <Input
                id="acceptName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acceptPhone">Teléfono</Label>
              <Input
                id="acceptPhone"
                value={phone}
                inputMode="tel"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0981 123456"
              />
              <p className="text-muted-foreground text-xs">
                Obligatorio: la orden de trabajo necesita a quién llamar.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? "Creando orden..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
