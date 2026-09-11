import { InvalidStatusTransitionError } from "@/shared/domain/errors";

export const REPAIR_STATUSES = [
  "RECEIVED",
  "IN_DIAGNOSIS",
  "QUOTE_SENT",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "AWAITING_PARTS",
  "REPAIRED",
  "READY_FOR_PICKUP",
  "DELIVERED",
  "CANCELLED",
] as const;

export type RepairStatus = (typeof REPAIR_STATUSES)[number];

/**
 * The only legal moves. The UI renders exactly what this table permits, and the
 * use case re-checks it server-side, so a crafted request cannot skip states.
 *
 * Two deliberate decisions:
 *
 * - DELIVERED is terminal. A device that comes back under warranty becomes a
 *   NEW order linked by IMEI, so each order keeps its own cost, price and
 *   profit. Reopening a delivered order would corrupt that record.
 * - CANCELLED can return to RECEIVED. Cancelling the wrong order happens at a
 *   busy counter, and forcing a duplicate order is worse than allowing an
 *   audited undo.
 */
const TRANSITIONS: Record<RepairStatus, readonly RepairStatus[]> = {
  RECEIVED: ["IN_DIAGNOSIS", "QUOTE_SENT", "IN_REPAIR", "CANCELLED"],
  IN_DIAGNOSIS: ["QUOTE_SENT", "IN_REPAIR", "AWAITING_PARTS", "REPAIRED", "CANCELLED"],
  QUOTE_SENT: ["AWAITING_APPROVAL", "IN_REPAIR", "CANCELLED"],
  AWAITING_APPROVAL: ["IN_REPAIR", "AWAITING_PARTS", "CANCELLED"],
  IN_REPAIR: ["AWAITING_PARTS", "REPAIRED", "CANCELLED"],
  AWAITING_PARTS: ["IN_REPAIR", "CANCELLED"],
  REPAIRED: ["READY_FOR_PICKUP", "IN_REPAIR", "CANCELLED"],
  READY_FOR_PICKUP: ["DELIVERED", "IN_REPAIR", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: ["RECEIVED"],
};

export function allowedTransitions(from: RepairStatus): readonly RepairStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: RepairStatus, to: RepairStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RepairStatus, to: RepairStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionError(REPAIR_STATUS_LABEL[from], REPAIR_STATUS_LABEL[to]);
  }
}

/** Spanish labels for the counter. Identifiers stay stable; labels can change. */
export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED: "Ingresado",
  IN_DIAGNOSIS: "En diagnóstico",
  QUOTE_SENT: "Presupuesto enviado",
  AWAITING_APPROVAL: "Esperando aprobación",
  IN_REPAIR: "En reparación",
  AWAITING_PARTS: "Esperando repuesto",
  REPAIRED: "Reparado",
  READY_FOR_PICKUP: "Listo para retirar",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

/** Badge tone per status, so the dashboard reads at a glance. */
export const REPAIR_STATUS_TONE: Record<RepairStatus, string> = {
  RECEIVED: "bg-slate-100 text-slate-800 border-slate-300",
  IN_DIAGNOSIS: "bg-sky-100 text-sky-900 border-sky-300",
  QUOTE_SENT: "bg-indigo-100 text-indigo-900 border-indigo-300",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-900 border-amber-300",
  IN_REPAIR: "bg-blue-100 text-blue-900 border-blue-300",
  AWAITING_PARTS: "bg-orange-100 text-orange-900 border-orange-300",
  REPAIRED: "bg-teal-100 text-teal-900 border-teal-300",
  READY_FOR_PICKUP: "bg-emerald-100 text-emerald-900 border-emerald-300",
  DELIVERED: "bg-zinc-100 text-zinc-600 border-zinc-300",
  CANCELLED: "bg-rose-100 text-rose-900 border-rose-300",
};

/** Statuses where the shop still owes the customer work or a device. */
export const OPEN_STATUSES: readonly RepairStatus[] = [
  "RECEIVED",
  "IN_DIAGNOSIS",
  "QUOTE_SENT",
  "AWAITING_APPROVAL",
  "IN_REPAIR",
  "AWAITING_PARTS",
  "REPAIRED",
  "READY_FOR_PICKUP",
];

/** Statuses where the device is finished and physically waiting for pickup. */
export const AWAITING_PICKUP_STATUSES: readonly RepairStatus[] = ["READY_FOR_PICKUP"];

export const CLOSED_STATUSES: readonly RepairStatus[] = ["DELIVERED", "CANCELLED"];

export function isOpen(status: RepairStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * A repair is late when it is still open and its estimated delivery moment has
 * already passed.
 */
export function isOverdue(
  status: RepairStatus,
  estimatedDeliveryAt: Date | null,
  now: Date,
): boolean {
  if (!estimatedDeliveryAt) return false;
  if (!isOpen(status)) return false;
  return estimatedDeliveryAt.getTime() < now.getTime();
}
