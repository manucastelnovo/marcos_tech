/** Paraguay's country calling code. */
export const DEFAULT_COUNTRY_CODE = "595";

/**
 * Digits only. Everyone types phone numbers differently ("0981 123-456",
 * "+595 981 123456"), and search only works if what we store is canonical.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Renders a Paraguayan mobile as "0981 123-456". Anything that does not match
 * the local shape is returned as typed rather than mangled.
 */
export function formatPhone(digits: string): string {
  const clean = normalizePhone(digits);
  if (clean.length === 10 && clean.startsWith("0")) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 12 && clean.startsWith(DEFAULT_COUNTRY_CODE)) {
    const local = clean.slice(3);
    return `+${DEFAULT_COUNTRY_CODE} ${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return digits;
}

/**
 * Builds the international number wa.me expects: no plus sign, no separators,
 * and no local trunk zero. "0981123456" becomes "595981123456".
 */
export function toWhatsAppNumber(raw: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const clean = normalizePhone(raw);
  if (clean.startsWith(countryCode) && clean.length > countryCode.length + 6) return clean;
  const withoutTrunk = clean.startsWith("0") ? clean.slice(1) : clean;
  return `${countryCode}${withoutTrunk}`;
}

/** Loose check: enough digits to be a real number, without rejecting landlines. */
export function isPlausiblePhone(raw: string): boolean {
  const clean = normalizePhone(raw);
  return clean.length >= 6 && clean.length <= 15;
}
