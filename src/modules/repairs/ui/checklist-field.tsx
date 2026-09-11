"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_ACCEPTS_NOTE,
  CHECKLIST_KEYS,
  CHECKLIST_LABEL,
  checklistStateLabel,
  type ChecklistKey,
  type ChecklistState,
} from "../domain/repair-checklist";

export type ChecklistValue = Record<ChecklistKey, { state: ChecklistState; note: string }>;

export function emptyChecklist(): ChecklistValue {
  return Object.fromEntries(
    CHECKLIST_KEYS.map((key) => [key, { state: "NOT_TESTED" as ChecklistState, note: "" }]),
  ) as ChecklistValue;
}

/** Tapping cycles through the three states, so one tap per item is enough. */
const NEXT_STATE: Record<ChecklistState, ChecklistState> = {
  NOT_TESTED: "WORKING",
  WORKING: "FAILING",
  FAILING: "NOT_TESTED",
};

const STATE_TONE: Record<ChecklistState, string> = {
  NOT_TESTED: "border-dashed border-zinc-300 bg-white text-zinc-500",
  WORKING: "border-emerald-400 bg-emerald-50 text-emerald-900",
  FAILING: "border-red-400 bg-red-50 text-red-900",
};

/**
 * Fourteen optional checks. Everything starts as "not tested" and stays that
 * way unless someone says otherwise: a form that demands fourteen answers is a
 * form the counter abandons.
 */
export function ChecklistField({
  value,
  onChange,
}: {
  value: ChecklistValue;
  onChange: (value: ChecklistValue) => void;
}) {
  function cycle(key: ChecklistKey) {
    const current = value[key];
    const nextState = NEXT_STATE[current.state];
    onChange({
      ...value,
      [key]: {
        state: nextState,
        note: nextState === "NOT_TESTED" ? "" : current.note,
      },
    });
  }

  function setNote(key: ChecklistKey, note: string) {
    onChange({ ...value, [key]: { ...value[key], note } });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Tocá cada item para cambiarlo. Todo es opcional.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {CHECKLIST_KEYS.map((key) => {
          const entry = value[key];
          const showNote = CHECKLIST_ACCEPTS_NOTE.has(key) && entry.state !== "NOT_TESTED";

          return (
            <div key={key} className="space-y-1">
              <button
                type="button"
                onClick={() => cycle(key)}
                aria-label={`${CHECKLIST_LABEL[key]}: ${checklistStateLabel(key, entry.state)}`}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                  STATE_TONE[entry.state],
                )}
              >
                <span className="text-sm font-medium">{CHECKLIST_LABEL[key]}</span>
                <span className="text-xs">{checklistStateLabel(key, entry.state)}</span>
              </button>

              {showNote ? (
                <Input
                  value={entry.note}
                  onChange={(event) => setNote(key, event.target.value)}
                  placeholder={key === "BATTERY" ? "85%" : "Detalle"}
                  className="h-8 text-xs"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Only items the counter actually touched are sent to the server. */
export function checklistToPayload(value: ChecklistValue) {
  return CHECKLIST_KEYS.map((key) => ({
    key,
    state: value[key].state,
    note: value[key].note.trim(),
  })).filter((entry) => entry.state !== "NOT_TESTED" || entry.note !== "");
}
