import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDate, formatRelative } from "@/shared/domain/datetime";
import { MoneyText } from "@/shared/ui/money-text";
import { listRepairs, type RepairFilters } from "@/modules/repairs/application/queries";
import {
  REPAIR_STATUSES,
  REPAIR_STATUS_LABEL,
  isOverdue,
  type RepairStatus,
} from "@/modules/repairs/domain/repair-status";
import { OverdueBadge, StatusBadge, UrgencyBadge } from "@/modules/repairs/ui/badges";

type SearchParams = {
  estado?: string;
  urgencia?: string;
  atrasadas?: string;
  q?: string;
  mias?: string;
};

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePageUser();
  const params = await searchParams;

  const filters: RepairFilters = {
    search: params.q,
    onlyUrgent: params.urgencia === "si",
    onlyOverdue: params.atrasadas === "si",
    onlyOpen: params.estado === "abiertas",
    status: isRepairStatus(params.estado) ? params.estado : undefined,
    technicianId: params.mias === "si" ? user.id : undefined,
  };

  const repairs = await listRepairs(filters);
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reparaciones</h1>
          <p className="text-muted-foreground text-sm">
            {repairs.length} {repairs.length === 1 ? "orden" : "órdenes"}
          </p>
        </div>
        {can(user.role, "repair.create") ? (
          <Button render={<Link href="/reparaciones/nueva" />}>Recibir equipo</Button>
        ) : null}
      </div>

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Orden, IMEI, cliente, teléfono o modelo"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip href="/reparaciones" label="Todas" active={!hasFilter(params)} />
        <FilterChip
          href="/reparaciones?estado=abiertas"
          label="Abiertas"
          active={params.estado === "abiertas"}
        />
        <FilterChip
          href="/reparaciones?urgencia=si"
          label="Urgentes"
          active={params.urgencia === "si"}
        />
        <FilterChip
          href="/reparaciones?atrasadas=si"
          label="Atrasadas"
          active={params.atrasadas === "si"}
        />
        {user.role === "TECHNICIAN" ? (
          <FilterChip href="/reparaciones?mias=si" label="Mías" active={params.mias === "si"} />
        ) : null}
        {REPAIR_STATUSES.map((status) => (
          <FilterChip
            key={status}
            href={`/reparaciones?estado=${status}`}
            label={REPAIR_STATUS_LABEL[status]}
            active={params.estado === status}
          />
        ))}
      </div>

      {repairs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            No hay reparaciones que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {repairs.map((repair) => (
            <Link key={repair.id} href={`/reparaciones/${repair.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="grid gap-2 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <div className="font-mono text-sm font-semibold">{repair.orderNumber}</div>

                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {repair.brandName} {repair.modelName}
                    </div>
                    <div className="text-muted-foreground truncate text-sm">
                      {repair.customerName}
                      {repair.technicianName ? ` · ${repair.technicianName}` : ""}
                      {" · "}
                      {formatDate(repair.receivedAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {isOverdue(repair.status, repair.estimatedDeliveryAt, now) ? (
                      <OverdueBadge />
                    ) : null}
                    <UrgencyBadge urgency={repair.urgency} />
                    <StatusBadge status={repair.status} />
                    <MoneyText
                      amount={repair.finalPrice}
                      currency={repair.currency}
                      className="text-sm font-semibold tabular-nums"
                    />
                  </div>

                  {repair.estimatedDeliveryAt ? (
                    <div className="text-muted-foreground text-xs md:col-start-2">
                      Entrega {formatRelative(repair.estimatedDeliveryAt)}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
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

function hasFilter(params: SearchParams): boolean {
  return Boolean(params.estado || params.urgencia || params.atrasadas || params.q || params.mias);
}

function isRepairStatus(value: string | undefined): value is RepairStatus {
  return Boolean(value) && (REPAIR_STATUSES as readonly string[]).includes(value as string);
}
