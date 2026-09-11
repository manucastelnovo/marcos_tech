/**
 * Intake checklist. Every item is optional and defaults to NOT_TESTED, because
 * a counter that forces fourteen answers is a counter that stops being used.
 */
export const CHECKLIST_KEYS = [
  "POWERS_ON",
  "CHARGES",
  "SCREEN",
  "TOUCH",
  "CAMERAS",
  "MICROPHONE",
  "SPEAKER",
  "BIOMETRICS",
  "WIFI",
  "BLUETOOTH",
  "BATTERY",
  "PHYSICAL_DAMAGE",
  "MOISTURE",
  "MISSING_PARTS",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export const CHECKLIST_STATES = ["NOT_TESTED", "WORKING", "FAILING"] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];

export const CHECKLIST_LABEL: Record<ChecklistKey, string> = {
  POWERS_ON: "Enciende",
  CHARGES: "Carga",
  SCREEN: "Pantalla",
  TOUCH: "Táctil",
  CAMERAS: "Cámaras",
  MICROPHONE: "Micrófono",
  SPEAKER: "Parlante",
  BIOMETRICS: "Face ID / huella",
  WIFI: "Wi-Fi",
  BLUETOOTH: "Bluetooth",
  BATTERY: "Batería",
  PHYSICAL_DAMAGE: "Golpes",
  MOISTURE: "Humedad",
  MISSING_PARTS: "Piezas faltantes",
};

/**
 * For most items WORKING is the good outcome. For damage, moisture and missing
 * parts the polarity flips: "present" is bad news. The counter should read
 * "Tiene humedad: sí", not "Humedad: funciona".
 */
export const CHECKLIST_INVERTED: ReadonlySet<ChecklistKey> = new Set([
  "PHYSICAL_DAMAGE",
  "MOISTURE",
  "MISSING_PARTS",
]);

export function checklistStateLabel(key: ChecklistKey, state: ChecklistState): string {
  if (state === "NOT_TESTED") return "Sin probar";
  if (CHECKLIST_INVERTED.has(key)) return state === "FAILING" ? "Sí" : "No";
  return state === "WORKING" ? "Funciona" : "Falla";
}

/** Items whose free-text note is genuinely useful, e.g. battery health "85%". */
export const CHECKLIST_ACCEPTS_NOTE: ReadonlySet<ChecklistKey> = new Set([
  "BATTERY",
  "PHYSICAL_DAMAGE",
  "MISSING_PARTS",
]);

export type ChecklistEntry = {
  key: ChecklistKey;
  state: ChecklistState;
  note?: string | null;
};

/** Fills the gaps so a repair always exposes all fourteen items. */
export function completeChecklist(entries: readonly ChecklistEntry[]): ChecklistEntry[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  return CHECKLIST_KEYS.map(
    (key) => byKey.get(key) ?? { key, state: "NOT_TESTED" as ChecklistState, note: null },
  );
}
