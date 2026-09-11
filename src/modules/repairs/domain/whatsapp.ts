import { toWhatsAppNumber } from "@/modules/customers/domain/phone";

export type TemplateVariables = {
  cliente: string;
  equipo: string;
  orden: string;
  total: string;
  saldo: string;
};

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Fills a message template. Unknown placeholders are left untouched rather than
 * blanked, so a typo in a template is visible instead of silently swallowed.
 */
export function renderTemplate(body: string, variables: TemplateVariables): string {
  return body.replace(PLACEHOLDER, (match, key: string) => {
    const value = variables[key as keyof TemplateVariables];
    return value === undefined ? match : value;
  });
}

/**
 * Builds a wa.me deep link.
 *
 * Phase 1 deliberately stops here instead of integrating the WhatsApp Business
 * API: a prefilled link covers almost all of the value, needs no approval, no
 * per-message cost, and no phone-number migration.
 */
export function whatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}
