import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/shared/domain/errors";
import { PERMISSIONS, USER_ROLES, assertCan, can, permissionsFor } from "./permissions";

describe("permissions", () => {
  it("gives the administrator everything", () => {
    for (const permission of PERMISSIONS) {
      expect(can("ADMIN", permission)).toBe(true);
    }
  });

  it("never lets a technician touch prices", () => {
    expect(can("TECHNICIAN", "repair.editPricing")).toBe(false);
    expect(() => assertCan("TECHNICIAN", "repair.editPricing")).toThrow(ForbiddenError);
  });

  it("never lets a technician create or delete repairs", () => {
    expect(can("TECHNICIAN", "repair.create")).toBe(false);
    expect(can("TECHNICIAN", "repair.softDelete")).toBe(false);
  });

  it("lets a technician consume parts but never receive or adjust stock", () => {
    expect(can("TECHNICIAN", "repair.usePart")).toBe(true);
    expect(can("TECHNICIAN", "stock.view")).toBe(true);
    expect(can("TECHNICIAN", "stock.manage")).toBe(false);
  });

  it("lets a technician do the job the spec describes", () => {
    expect(can("TECHNICIAN", "repair.changeStatus")).toBe(true);
    expect(can("TECHNICIAN", "repair.editDiagnosis")).toBe(true);
    expect(can("TECHNICIAN", "repair.uploadPhoto")).toBe(true);
    expect(can("TECHNICIAN", "repair.view")).toBe(true);
  });

  it("lets a seller run the counter", () => {
    expect(can("SELLER", "repair.create")).toBe(true);
    expect(can("SELLER", "repair.editPricing")).toBe(true);
    expect(can("SELLER", "repair.deliver")).toBe(true);
    expect(can("SELLER", "customer.manage")).toBe(true);
  });

  it("keeps user administration and deletion to the administrator", () => {
    for (const role of USER_ROLES) {
      if (role === "ADMIN") continue;
      expect(can(role, "user.manage")).toBe(false);
      expect(can(role, "repair.softDelete")).toBe(false);
      expect(can(role, "audit.view")).toBe(false);
    }
  });

  it("never grants a permission that does not exist", () => {
    for (const role of USER_ROLES) {
      for (const permission of permissionsFor(role)) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});
