import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { formatDate } from "@/shared/domain/datetime";
import { listCustomers } from "@/modules/customers/application/queries";
import { formatPhone } from "@/modules/customers/domain/phone";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePageUser();
  const { q } = await searchParams;
  const customers = await listCustomers(q);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-muted-foreground text-sm">
          {customers.length} {customers.length === 1 ? "cliente" : "clientes"}
        </p>
      </div>

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nombre o teléfono"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {customers.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            No hay clientes que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/clientes/${customer.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{customer.fullName}</div>
                    <div className="text-muted-foreground text-sm">
                      {formatPhone(customer.phone)}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-right text-sm">
                    <div>
                      {customer.repairCount}{" "}
                      {customer.repairCount === 1 ? "reparación" : "reparaciones"}
                    </div>
                    {customer.lastRepairAt ? (
                      <div className="text-xs">Última: {formatDate(customer.lastRepairAt)}</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
