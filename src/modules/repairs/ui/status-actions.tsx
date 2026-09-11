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
import { cn } from "@/lib/utils";
import { WARRANTY_OPTIONS, warrantyLabel } from "../domain/warranty";
import {
  REPAIR_STATUS_LABEL,
  allowedTransitions,
  type RepairStatus,
} from "../domain/repair-status";
import { changeStatusAction, deliverRepairAction } from "../actions";

/**
 * Renders exactly the moves the state machine allows from here. The server
 * checks the same table again, so a stale page cannot post an illegal jump.
 */
export function StatusActions({
  repairId,
  status,
  canChangeStatus,
  canDeliver,
}: {
  repairId: string;
  status: RepairStatus;
  canChangeStatus: boolean;
  canDeliver: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const transitions = allowedTransitions(status).filter((target) => target !== "DELIVERED");
  const canHandOver = allowedTransitions(status).includes("DELIVERED") && canDeliver;

  function move(target: RepairStatus) {
    startTransition(async () => {
      const result = await changeStatusAction({ repairId, toStatus: target, note });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setNote("");
      toast.success(`Estado: ${REPAIR_STATUS_LABEL[target]}`);
      router.refresh();
    });
  }

  if (!canChangeStatus && !canHandOver) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="statusNote">Nota del cambio (opcional)</Label>
        <Input
          id="statusNote"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Se cambió la pantalla, falta probar el táctil"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {canChangeStatus
          ? transitions.map((target) => (
              <Button
                key={target}
                type="button"
                variant={target === "CANCELLED" ? "destructive" : "secondary"}
                disabled={isPending}
                onClick={() => move(target)}
              >
                {REPAIR_STATUS_LABEL[target]}
              </Button>
            ))
          : null}

        {canHandOver ? (
          <DeliverDialog repairId={repairId} note={note} disabled={isPending} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Delivery is its own dialog because it decides the warranty, which is what
 * makes a returning device recognisable months later.
 */
function DeliverDialog({
  repairId,
  note,
  disabled,
}: {
  repairId: string;
  note: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [warrantyDays, setWarrantyDays] = useState<number>(30);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deliverRepairAction({ repairId, warrantyDays, note });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setIsOpen(false);
      toast.success("Equipo entregado");
      router.refresh();
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>Entregar equipo</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entregar equipo</DialogTitle>
          <DialogDescription>
            Elegí la garantía. El sistema avisa si el equipo vuelve dentro del período.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {WARRANTY_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWarrantyDays(days)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                warrantyDays === days
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {warrantyLabel(days)}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={isPending}>
            {isPending ? "Entregando..." : "Confirmar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
