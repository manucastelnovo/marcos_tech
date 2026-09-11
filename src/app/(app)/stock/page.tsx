import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { MoneyText } from "@/shared/ui/money-text";
import { listProducts, getStockAlerts } from "@/modules/inventory/application/queries";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABEL,
  type ProductCategory,
} from "@/modules/inventory/domain/product";
import { StockHealthBadge } from "@/modules/inventory/ui/stock-badges";

type SearchParams = { q?: string; categoria?: string; alertas?: string };

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "stock.view")) redirect("/");

  const params = await searchParams;
  const category = isCategory(params.categoria) ? params.categoria : undefined;

  const [products, alerts] = await Promise.all([
    listProducts({ search: params.q, category, onlyAlerts: params.alertas === "si" }),
    getStockAlerts(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-muted-foreground text-sm">
            {products.length} {products.length === 1 ? "producto" : "productos"}
          </p>
        </div>
        {can(user.role, "stock.manage") ? (
          <Button render={<Link href="/stock/nuevo" />}>Nuevo producto</Button>
        ) : null}
      </div>

      {alerts.negative > 0 ? (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-sm">
            <strong>{alerts.negative}</strong>{" "}
            {alerts.negative === 1 ? "producto tiene" : "productos tienen"} stock negativo. El
            sistema y el estante no coinciden: falta registrar una compra o hay que hacer un
            ajuste.
          </CardContent>
        </Card>
      ) : null}

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Código, nombre o modelo compatible"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip href="/stock" label="Todos" active={!params.categoria && params.alertas !== "si"} />
        <Chip
          href="/stock?alertas=si"
          label={`Necesitan atención (${alerts.negative + alerts.out + alerts.low})`}
          active={params.alertas === "si"}
        />
        {PRODUCT_CATEGORIES.map((option) => (
          <Chip
            key={option}
            href={`/stock?categoria=${option}`}
            label={PRODUCT_CATEGORY_LABEL[option]}
            active={params.categoria === option}
          />
        ))}
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            No hay productos que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {products.map((product) => (
            <Link key={product.id} href={`/stock/${product.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      <span className="font-mono text-sm">{product.sku}</span> · {product.name}
                    </div>
                    <div className="text-muted-foreground truncate text-sm">
                      {PRODUCT_CATEGORY_LABEL[product.category]}
                      {product.compatibility ? ` · ${product.compatibility}` : ""}
                      {product.location ? ` · ${product.location}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-muted-foreground text-xs">Costo</div>
                      <MoneyText
                        amount={product.averageCost}
                        currency={product.currency}
                        className="text-sm tabular-nums"
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground text-xs">Venta</div>
                      <MoneyText
                        amount={product.salePrice}
                        currency={product.currency}
                        className="text-sm tabular-nums"
                      />
                    </div>
                    <div className="w-14 text-right text-xl font-semibold tabular-nums">
                      {product.quantity}
                    </div>
                    <StockHealthBadge health={product.health} />
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

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}

function isCategory(value: string | undefined): value is ProductCategory {
  return Boolean(value) && (PRODUCT_CATEGORIES as readonly string[]).includes(value as string);
}
