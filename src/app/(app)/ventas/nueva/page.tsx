import { redirect } from "next/navigation";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { getCashStatus } from "@/modules/cash/application/queries";
import { listCurrentRates } from "@/modules/cash/application/exchange-rates";
import { getFeaturedProducts, listCatalogCategories } from "@/modules/sales/application/catalog";
import { PointOfSale } from "@/modules/sales/ui/point-of-sale";
import type { Rates } from "@/modules/sales/domain/cart";

export default async function NewSalePage() {
  const user = await requirePageUser();
  if (!can(user.role, "sale.create")) redirect("/");

  const [cash, rateEntries, categories, featured] = await Promise.all([
    getCashStatus(),
    listCurrentRates(),
    listCatalogCategories(),
    getFeaturedProducts(8),
  ]);

  // Only used to preview prices. The server converts again with the rate in
  // force when the sale is confirmed.
  const rates: Rates = Object.fromEntries(
    rateEntries.map((entry) => [entry.currency, entry.rate]),
  );

  return (
    <PointOfSale
      rates={rates}
      cash={cash}
      categories={categories}
      featured={featured}
      canCreateCustomer={can(user.role, "customer.manage")}
    />
  );
}
