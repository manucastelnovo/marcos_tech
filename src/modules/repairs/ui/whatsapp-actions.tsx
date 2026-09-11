import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/shared/ui/money-text";
import type { Currency } from "@/shared/domain/money";
import type { WhatsAppTemplateOption } from "../application/catalog";
import { renderTemplate, whatsAppLink } from "../domain/whatsapp";

/**
 * One tap per message. The link opens WhatsApp with the text already written,
 * and the person still presses send, which keeps a human in the loop.
 */
export function WhatsAppActions({
  templates,
  phone,
  customerName,
  device,
  orderNumber,
  finalPrice,
  balance,
  currency,
}: {
  templates: WhatsAppTemplateOption[];
  phone: string;
  customerName: string;
  device: string;
  orderNumber: string;
  finalPrice: string | null;
  balance: string | null;
  currency: Currency;
}) {
  const variables = {
    cliente: customerName.split(" ")[0] ?? customerName,
    equipo: device,
    orden: orderNumber,
    total: formatMoney(finalPrice, currency),
    saldo: formatMoney(balance, currency),
  };

  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((template) => (
        <Button
          key={template.key}
          variant="secondary"
          size="sm"
          render={
            <a
              href={whatsAppLink(phone, renderTemplate(template.body, variables))}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <MessageCircle className="size-4" />
          {template.label}
        </Button>
      ))}
    </div>
  );
}
