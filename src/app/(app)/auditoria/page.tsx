import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/shared/infrastructure/auth/session";
import { can } from "@/modules/users/domain/permissions";
import { formatDateTime } from "@/shared/domain/datetime";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  listAuditActors,
  listAuditEntries,
} from "@/modules/audit/application/queries";
import type { AuditAction } from "@/generated/prisma/enums";

/** Where each entity type lives, so a log line is one click from the record. */
const ENTITY_ROUTE: Record<string, string> = {
  Repair: "/reparaciones",
  Customer: "/clientes",
  Product: "/stock",
  Sale: "/ventas",
  Quote: "/presupuestos",
  CashSession: "/caja",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; entidad?: string; accion?: string; q?: string }>;
}) {
  const user = await requirePageUser();
  if (!can(user.role, "audit.view")) redirect("/");

  const params = await searchParams;
  const [entries, actors] = await Promise.all([
    listAuditEntries({
      actorId: params.actor,
      entityType: params.entidad,
      action: isAuditAction(params.accion) ? params.accion : undefined,
      search: params.q,
    }),
    listAuditActors(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría</h1>
        <p className="text-muted-foreground text-sm">
          Quién hizo qué y cuándo. Se viene guardando desde el primer día y no se puede editar.
        </p>
      </div>

      <form className="flex gap-2" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar en las descripciones"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="-mx-4 space-y-2 overflow-x-auto px-4">
        <div className="flex gap-2 pb-1">
          <Chip href="/auditoria" label="Todo" active={!hasFilter(params)} />
          {actors.map((actor) => (
            <Chip
              key={actor.id}
              href={`/auditoria?actor=${actor.id}`}
              label={actor.fullName}
              active={params.actor === actor.id}
            />
          ))}
        </div>
        <div className="flex gap-2 pb-1">
          {Object.entries(AUDIT_ENTITY_LABEL).map(([type, label]) => (
            <Chip
              key={type}
              href={`/auditoria?entidad=${type}`}
              label={label}
              active={params.entidad === type}
            />
          ))}
        </div>
        <div className="flex gap-2 pb-1">
          {AUDIT_ACTIONS.map((action) => (
            <Chip
              key={action}
              href={`/auditoria?accion=${action}`}
              label={AUDIT_ACTION_LABEL[action]}
              active={params.accion === action}
            />
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-8 text-center text-sm">
            No hay registros que coincidan.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const route = ENTITY_ROUTE[entry.entityType];

            return (
              <Card key={entry.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {AUDIT_ACTION_LABEL[entry.action]}
                    </span>
                    <span className="text-sm font-medium">{entry.summary}</span>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDateTime(entry.createdAt)} · {entry.actorName}
                    </span>
                  </div>

                  {entry.changes.length > 0 ? (
                    <ul className="text-muted-foreground space-y-0.5 text-xs">
                      {entry.changes.map((change) => (
                        <li key={change.field}>
                          <span className="font-medium">{change.field}</span>:{" "}
                          <span className="line-through">{change.before}</span> →{" "}
                          <span className="text-foreground">{change.after}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {route ? (
                    <Link
                      href={`${route}/${entry.entityId}`}
                      className="text-xs hover:underline"
                    >
                      Ver {AUDIT_ENTITY_LABEL[entry.entityType]?.toLowerCase()}
                    </Link>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
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

function hasFilter(params: { actor?: string; entidad?: string; accion?: string; q?: string }) {
  return Boolean(params.actor || params.entidad || params.accion || params.q);
}

function isAuditAction(value: string | undefined): value is AuditAction {
  return Boolean(value) && (AUDIT_ACTIONS as readonly string[]).includes(value as string);
}
