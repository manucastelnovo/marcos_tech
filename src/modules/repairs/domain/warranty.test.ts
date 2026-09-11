import { describe, expect, it } from "vitest";
import { warrantyStatus } from "./warranty";

const delivered = new Date("2026-06-01T15:00:00Z");

describe("warrantyStatus", () => {
  it("reports no warranty when none was granted", () => {
    expect(warrantyStatus(delivered, null, new Date()).granted).toBe(false);
    expect(warrantyStatus(delivered, 0, new Date()).granted).toBe(false);
  });

  it("reports no warranty before the device was handed back", () => {
    expect(warrantyStatus(null, 90, new Date()).granted).toBe(false);
  });

  it("counts from delivery, not from intake", () => {
    const status = warrantyStatus(delivered, 30, new Date("2026-06-15T15:00:00Z"));
    expect(status.isActive).toBe(true);
    expect(status.daysRemaining).toBe(16);
    expect(status.expiresAt?.toISOString()).toBe("2026-07-01T15:00:00.000Z");
  });

  it("expires on the exact day", () => {
    const justBefore = warrantyStatus(delivered, 30, new Date("2026-07-01T14:59:00Z"));
    const justAfter = warrantyStatus(delivered, 30, new Date("2026-07-01T15:01:00Z"));
    expect(justBefore.isActive).toBe(true);
    expect(justAfter.isActive).toBe(false);
    expect(justAfter.daysRemaining).toBe(0);
  });
});
