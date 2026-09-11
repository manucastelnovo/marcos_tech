import { redirect } from "next/navigation";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { getDeviceCatalog } from "@/modules/repairs/application/catalog";
import { QuoteForm } from "@/modules/quotes/ui/quote-form";

export default async function NewQuotePage() {
  const user = await requirePageUser();
  if (!can(user.role, "quote.manage")) redirect("/presupuestos");

  const catalog = await getDeviceCatalog();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo presupuesto</h1>
        <p className="text-muted-foreground text-sm">
          Para el cliente que pregunta cuánto sale, sin dejar el equipo.
        </p>
      </div>

      <QuoteForm catalog={catalog} />
    </div>
  );
}
