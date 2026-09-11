import { redirect } from "next/navigation";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { getOpenCashSession } from "@/modules/cash/application/queries";
import { PointOfSale } from "@/modules/sales/ui/point-of-sale";

export default async function NewSalePage() {
  const user = await requirePageUser();
  if (!can(user.role, "sale.create")) redirect("/");

  const session = await getOpenCashSession();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva venta</h1>
        <p className="text-muted-foreground text-sm">
          Buscá el producto, ajustá cantidad y precio si hace falta, y cerrá.
        </p>
      </div>

      <PointOfSale hasOpenSession={session !== null} />
    </div>
  );
}
