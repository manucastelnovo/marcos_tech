import { ForbiddenError } from "@/shared/domain/errors";

export const USER_ROLES = ["ADMIN", "SELLER", "TECHNICIAN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Administrador",
  SELLER: "Vendedor",
  TECHNICIAN: "Técnico",
};

/**
 * Capabilities, not screens. A permission names a thing someone may do, so the
 * check reads the same in a Server Action and in a button.
 */
export const PERMISSIONS = [
  "repair.view",
  "repair.create",
  "repair.editIntake",
  "repair.editDiagnosis",
  "repair.editPricing",
  "repair.changeStatus",
  "repair.assignTechnician",
  "repair.deliver",
  "repair.uploadPhoto",
  "repair.softDelete",
  "repair.usePart",
  "customer.view",
  "customer.manage",
  "stock.view",
  "stock.manage",
  "cash.view",
  "cash.operate",
  "cash.close",
  "sale.view",
  "sale.create",
  "quote.view",
  "quote.manage",
  "rate.manage",
  "user.manage",
  "audit.view",
  "template.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),

  SELLER: new Set<Permission>([
    "repair.view",
    "repair.create",
    "repair.editIntake",
    "repair.editPricing",
    "repair.changeStatus",
    "repair.assignTechnician",
    "repair.deliver",
    "repair.uploadPhoto",
    "repair.usePart",
    "customer.view",
    "customer.manage",
    "stock.view",
    "stock.manage",
    // A seller runs the register and closes it at the end of the day. The
    // administrator sees who closed it and with what difference.
    "cash.view",
    "cash.operate",
    "cash.close",
    "sale.view",
    "sale.create",
    "quote.view",
    "quote.manage",
  ]),

  // A technician moves work forward and records what they found, including the
  // parts they consumed. Prices, purchases, stock adjustments, customers and
  // deletions are deliberately out of reach.
  TECHNICIAN: new Set<Permission>([
    "repair.view",
    "repair.editDiagnosis",
    "repair.changeStatus",
    "repair.uploadPhoto",
    "repair.usePart",
    "customer.view",
    "stock.view",
  ]),
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertCan(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(
      `El rol ${ROLE_LABEL[role]} no puede realizar esta acción (${permission})`,
    );
  }
}

export function permissionsFor(role: UserRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
