import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { ProductForm } from "@/modules/inventory/ui/product-form";

export default async function NewProductPage() {
  const user = await requirePageUser();
  if (!can(user.role, "stock.manage")) redirect("/stock");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo producto</h1>
        <p className="text-muted-foreground text-sm">
          Las unidades y el costo se cargan después, registrando el primer ingreso.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <ProductForm />
        </CardContent>
      </Card>
    </div>
  );
}
