import { describe, expect, it } from "vitest";
import { InvalidStatusTransitionError } from "@/shared/domain/errors";
import {
  REPAIR_STATUSES,
  REPAIR_STATUS_LABEL,
  allowedTransitions,
  assertTransition,
  canTransition,
  isOpen,
  isOverdue,
  type RepairStatus,
} from "./repair-status";

describe("repair status machine", () => {
  it("labels every status", () => {
    for (const status of REPAIR_STATUSES) {
      expect(REPAIR_STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it("never proposes a transition to itself", () => {
    for (const status of REPAIR_STATUSES) {
      expect(allowedTransitions(status)).not.toContain(status);
    }
  });

  it("only proposes known statuses", () => {
    for (const status of REPAIR_STATUSES) {
      for (const target of allowedTransitions(status)) {
        expect(REPAIR_STATUSES).toContain(target);
      }
    }
  });

  it("walks the happy path from intake to delivery", () => {
    const path: RepairStatus[] = [
      "RECEIVED",
      "IN_DIAGNOSIS",
      "QUOTE_SENT",
      "AWAITING_APPROVAL",
      "IN_REPAIR",
      "REPAIRED",
      "READY_FOR_PICKUP",
      "DELIVERED",
    ];

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransition(path[index], path[index + 1])).toBe(true);
    }
  });

  it("refuses to skip from intake straight to delivered", () => {
    expect(canTransition("RECEIVED", "DELIVERED")).toBe(false);
    expect(() => assertTransition("RECEIVED", "DELIVERED")).toThrow(InvalidStatusTransitionError);
  });

  it("treats delivered as terminal so a warranty return becomes a new order", () => {
    expect(allowedTransitions("DELIVERED")).toHaveLength(0);
    expect(canTransition("DELIVERED", "IN_REPAIR")).toBe(false);
  });

  it("lets an accidental cancellation be undone", () => {
    expect(canTransition("CANCELLED", "RECEIVED")).toBe(true);
  });

  it("can cancel from every open status", () => {
    for (const status of REPAIR_STATUSES) {
      if (!isOpen(status)) continue;
      expect(canTransition(status, "CANCELLED")).toBe(true);
    }
  });

  it("reaches every status from intake", () => {
    const reached = new Set<RepairStatus>(["RECEIVED"]);
    const queue: RepairStatus[] = ["RECEIVED"];

    while (queue.length > 0) {
      const current = queue.shift() as RepairStatus;
      for (const next of allowedTransitions(current)) {
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }

    expect(reached.size).toBe(REPAIR_STATUSES.length);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  it("is late when an open repair passed its estimate", () => {
    expect(isOverdue("IN_REPAIR", new Date("2026-09-08T12:00:00Z"), now)).toBe(true);
  });

  it("is not late before the estimate", () => {
    expect(isOverdue("IN_REPAIR", new Date("2026-09-10T12:00:00Z"), now)).toBe(false);
  });

  it("is never late once delivered", () => {
    expect(isOverdue("DELIVERED", new Date("2026-01-01T12:00:00Z"), now)).toBe(false);
    expect(isOverdue("CANCELLED", new Date("2026-01-01T12:00:00Z"), now)).toBe(false);
  });

  it("is never late without an estimate", () => {
    expect(isOverdue("IN_REPAIR", null, now)).toBe(false);
  });
});
