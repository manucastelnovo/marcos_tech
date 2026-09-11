import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import { MoneyText } from "@/shared/ui/money-text";
import { getProductDetail } from "@/modules/inventory/application/queries";
import { PRODUCT_CATEGORY_LABEL } from "@/modules/inventory/domain/product";
import {
  MovementBadge,
  MovementQuantity,
  StockHealthBadge,
} from "@/modules/inventory/ui/stock-badges";
import { ProductForm } from "@/modules/inventory/ui/product-form";
import {
  AdjustStockForm,
  ReceiveStockForm,
} from "@/modules/inventory/ui/stock-movement-forms";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "stock.view")) redirect("/");

  const { id } = await params;
  const product = await getProductDetail(id);
  if (!product) notFound();

  const canManage = can(user.role, "stock.manage");
  const ledgerDisagrees = product.quantity !== product.ledgerQuantity;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{product.sku}</h1>
            <StockHealthBadge health={product.health} />
          </div>
          <p className="text-muted-foreground text-sm">
            {product.name} · {PRODUCT_CATEGORY_LABEL[product.category]}
            {product.compatibility ? ` · ${product.compatibility}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs">En stock</div>
          <div className="text-3xl font-semibold tabular-nums">{product.quantity}</div>
        </div>
      </div>

      {ledgerDisagrees ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>El historial y el contador no coinciden</AlertTitle>
          <AlertDescription>
            El contador dice {product.quantity} y la suma de movimientos da{" "}
            {product.ledgerQuantity}. Avisá al administrador antes de seguir operando este
            producto.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Movimientos</CardTitle>
            </CardHeader>
            <CardContent>
              {product.movements.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Sin movimientos. Registrá el primer ingreso para empezar a contar.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {product.movements.map((movement) => (
                    <li key={movement.id} className="flex flex-wrap items-center gap-3 py-2">
                      <MovementBadge type={movement.type} />
                      <MovementQuantity quantity={movement.quantity} />
                      <MoneyText
                        amount={movement.unitCost}
                        currency={movement.currency}
                        className="text-muted-foreground tabular-nums"
                      />
                      {movement.repairOrderNumber ? (
                        <Link
                          href={`/reparaciones/${movement.repairId}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {movement.repairOrderNumber}
                        </Link>
                      ) : null}
                      {movement.reason ? (
                        <span className="text-muted-foreground">{movement.reason}</span>
                      ) : null}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {formatDateTime(movement.createdAt)} · {movement.actorName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {product.tracksSerial ? (
            <Card>
              <CardHeader>
                <CardTitle>Números de serie</CardTitle>
              </CardHeader>
              <CardContent>
                {product.serials.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Sin series cargadas.</p>
                ) : (
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {product.serials.map((serial) => (
                      <li key={serial.id} className="flex justify-between gap-2">
                        <span className="font-mono">{serial.serial}</span>
                        <span className="text-muted-foreground text-xs">
                          {serial.status === "IN_STOCK"
                            ? "Disponible"
                            : serial.repairOrderNumber
                              ? `Usada en ${serial.repairOrderNumber}`
                              : "Usada"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Datos del producto</CardTitle>
              </CardHeader>
              <CardContent>
                <ProductForm
                  productId={product.id}
                  initial={{
                    sku: product.sku,
                    name: product.name,
                    category: product.category,
                    compatibility: product.compatibility ?? "",
                    currency: product.currency,
                    salePrice: product.salePrice ?? "",
                    minStock: String(product.minStock),
                    location: product.location ?? "",
                    tracksSerial: product.tracksSerial,
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Costo promedio">
                <MoneyText amount={product.averageCost} currency={product.currency} />
              </Row>
              <Row label="Precio de venta">
                <MoneyText amount={product.salePrice} currency={product.currency} />
              </Row>
              <Row label="Stock mínimo">{product.minStock}</Row>
              <Row label="Ubicación">{product.location ?? "—"}</Row>
            </CardContent>
          </Card>

          {canManage ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Registrar ingreso</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReceiveStockForm
                    productId={product.id}
                    currency={product.currency}
                    tracksSerial={product.tracksSerial}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ajustar stock</CardTitle>
                </CardHeader>
                <CardContent>
                  <AdjustStockForm productId={product.id} />
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
