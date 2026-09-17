import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { formatDateTime } from "@/shared/domain/datetime";

export type PosCashStatus = {
  isOpen: boolean;
  openedAt: Date | null;
  openedByName: string | null;
};

/**
 * The register rule is unchanged: with the register closed the sale is still
 * recorded, it just stays out of the count. This block says so before the
 * seller confirms, instead of after.
 */
export function CashStatusBlock({ status }: { status: PosCashStatus }) {
  if (status.isOpen) {
    return (
      <div className="border-success/30 bg-success/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
        <CircleCheck className="text-success mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 text-sm leading-tight">
          <p className="text-success font-semibold">Caja abierta</p>
          {status.openedAt ? (
            <p className="text-muted-foreground text-xs">
              Turno de {status.openedByName ?? "—"} desde {formatDateTime(status.openedAt)}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="border-warning/40 bg-warning/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
      <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 text-sm leading-tight">
        <p className="text-warning font-semibold">Caja cerrada</p>
        <p className="text-muted-foreground text-xs">
          La venta se registra igual, pero no entra en el arqueo hasta que se abra la caja.
        </p>
      </div>
      <Link
        href="/caja"
        className="text-warning hover:bg-warning/15 shrink-0 rounded-md px-2 py-1 text-xs font-semibold"
      >
        Ver caja
      </Link>
    </div>
  );
}
