import { TZDate } from "@date-fns/tz";
import { format, formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Everything is stored in UTC and rendered here. The shop's day boundary is the
 * one that matters for "received today" counts, and in Phase 2 it decides which
 * cash register a payment belongs to.
 */
export const SHOP_TIMEZONE = "America/Asuncion";

export function toShopTime(date: Date): TZDate {
  return new TZDate(date, SHOP_TIMEZONE);
}

export function formatDateTime(date: Date): string {
  return format(toShopTime(date), "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatDate(date: Date): string {
  return format(toShopTime(date), "dd/MM/yyyy", { locale: es });
}

export function formatTime(date: Date): string {
  return format(toShopTime(date), "HH:mm", { locale: es });
}

export function formatLongDate(date: Date): string {
  return format(toShopTime(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
}

/** "hace 3 días" / "en 2 horas", for overdue and pickup-reminder badges. */
export function formatRelative(date: Date): string {
  return formatDistanceToNowStrict(date, { locale: es, addSuffix: true });
}

/**
 * The UTC instants bounding a calendar day in the shop's timezone.
 * Using the server's local day here would put a 21:00 intake on the wrong date.
 */
export function shopDayRange(reference: Date = new Date()): { start: Date; end: Date } {
  const local = toShopTime(reference);
  const start = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    0,
    0,
    0,
    SHOP_TIMEZONE,
  );
  const end = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + 1,
    0,
    0,
    0,
    SHOP_TIMEZONE,
  );
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** The calendar year in the shop's timezone, used for order numbering. */
export function shopYear(reference: Date = new Date()): number {
  return toShopTime(reference).getFullYear();
}

/**
 * Turns a browser `datetime-local` value (which carries no zone) into the UTC
 * instant the shop meant when they typed it.
 */
export function shopLocalInputToUtc(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number) as unknown as number[];
  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, SHOP_TIMEZONE);
  return new Date(zoned.getTime());
}

/** The inverse, for pre-filling a `datetime-local` input from a stored instant. */
export function utcToShopLocalInput(date: Date | null): string {
  if (!date) return "";
  return format(toShopTime(date), "yyyy-MM-dd'T'HH:mm");
}
