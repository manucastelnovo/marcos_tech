import { cn } from "@/lib/utils";
import { REPAIR_STATUS_LABEL, REPAIR_STATUS_TONE, type RepairStatus } from "../domain/repair-status";
import { URGENCY_LABEL, URGENCY_TONE, type UrgencyLevel } from "../domain/repair-urgency";

const BASE = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status, className }: { status: RepairStatus; className?: string }) {
  return (
    <span className={cn(BASE, REPAIR_STATUS_TONE[status], className)}>
      {REPAIR_STATUS_LABEL[status]}
    </span>
  );
}

export function UrgencyBadge({
  urgency,
  className,
}: {
  urgency: UrgencyLevel;
  className?: string;
}) {
  // Normal is the default state and does not need to shout.
  if (urgency === "NORMAL") return null;

  return (
    <span className={cn(BASE, URGENCY_TONE[urgency], className)}>{URGENCY_LABEL[urgency]}</span>
  );
}

export function OverdueBadge({ className }: { className?: string }) {
  return (
    <span className={cn(BASE, "border-red-400 bg-red-600 text-white", className)}>Atrasado</span>
  );
}
