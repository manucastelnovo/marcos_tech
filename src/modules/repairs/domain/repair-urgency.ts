export const URGENCY_LEVELS = ["NORMAL", "URGENT", "VERY_URGENT"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  NORMAL: "Normal",
  URGENT: "Urgente",
  VERY_URGENT: "Muy urgente",
};

export const URGENCY_TONE: Record<UrgencyLevel, string> = {
  NORMAL: "bg-zinc-100 text-zinc-700 border-zinc-300",
  URGENT: "bg-amber-100 text-amber-900 border-amber-400",
  VERY_URGENT: "bg-red-100 text-red-900 border-red-400",
};

/** Sort weight so urgent work floats to the top of any list. */
export const URGENCY_WEIGHT: Record<UrgencyLevel, number> = {
  VERY_URGENT: 0,
  URGENT: 1,
  NORMAL: 2,
};
