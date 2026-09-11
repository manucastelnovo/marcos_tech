import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import type { AuditAction } from "@/generated/prisma/enums";

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "STATUS_CHANGE",
  "PRICE_CHANGE",
  "SOFT_DELETE",
  "PHOTO_ADDED",
  "STOCK_MOVEMENT",
  "PART_USED",
] as const;

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Creación",
  UPDATE: "Modificación",
  STATUS_CHANGE: "Cambio de estado",
  PRICE_CHANGE: "Cambio de precio",
  SOFT_DELETE: "Baja",
  PHOTO_ADDED: "Foto agregada",
  STOCK_MOVEMENT: "Movimiento de stock",
  PART_USED: "Repuesto usado",
};

/** The entity types the log actually contains, for the filter dropdown. */
export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  Repair: "Reparación",
  Customer: "Cliente",
  Product: "Producto",
  Sale: "Venta",
  Quote: "Presupuesto",
  CashSession: "Caja",
  ExchangeRate: "Cotización",
};

export type AuditEntry = {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary: string;
  changes: Array<{ field: string; before: string; after: string }>;
  createdAt: Date;
  actorName: string;
};

export type AuditFilters = {
  actorId?: string;
  entityType?: string;
  action?: AuditAction;
  entityId?: string;
  search?: string;
  take?: number;
};

/**
 * Reads the trail every use case has been writing since day one.
 *
 * Nothing here can edit or delete a row: this is a window, and an audit log you
 * can edit is not an audit log.
 */
export async function listAuditEntries(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  const search = filters.search?.trim();

  const rows = await prisma.auditLog.findMany({
    where: {
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(search ? { summary: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.take ?? 150,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      changes: true,
      createdAt: true,
      actor: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    changes: flattenChanges(row.changes),
    createdAt: row.createdAt,
    actorName: row.actor?.fullName ?? "Sistema",
  }));
}

export async function listAuditActors(): Promise<Array<{ id: string; fullName: string }>> {
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });
}

/**
 * The stored diff is a Json column written by `serialiseChangeSet`. Reading it
 * defensively keeps a malformed historical row from breaking the whole page.
 */
function flattenChanges(raw: unknown): Array<{ field: string; before: string; after: string }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const entries: Array<{ field: string; before: string; after: string }> = [];
  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const change = value as { before?: unknown; after?: unknown };
    entries.push({
      field,
      before: display(change.before),
      after: display(change.after),
    });
  }
  return entries;
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "vacío";
  if (typeof value === "boolean") return value ? "sí" : "no";
  return String(value);
}
