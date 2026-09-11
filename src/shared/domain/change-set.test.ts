import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { buildChangeSet } from "./change-set";

describe("buildChangeSet", () => {
  it("returns null when nothing changed", () => {
    expect(buildChangeSet({ a: "x" }, { a: "x" })).toBeNull();
  });

  it("reports only the fields that moved", () => {
    const changes = buildChangeSet({ a: "x", b: "y" }, { a: "x", b: "z" });
    expect(changes).toEqual({ b: { before: "y", after: "z" } });
  });

  it("treats a Decimal and its shorter string form as equal", () => {
    // Postgres returns Decimal(18,4) as "100.0000"; the use case writes "100.00".
    const changes = buildChangeSet({ price: new Decimal("100.0000") }, { price: "100.00" });
    expect(changes).toBeNull();
  });

  it("still catches a real price change", () => {
    const changes = buildChangeSet({ price: new Decimal("100.0000") }, { price: "150.00" });
    expect(changes).not.toBeNull();
    expect(changes?.price.after).toBe("150.00");
  });

  it("compares dates by instant, not identity", () => {
    const left = new Date("2026-09-09T12:00:00Z");
    const right = new Date("2026-09-09T12:00:00Z");
    expect(buildChangeSet({ at: left }, { at: right })).toBeNull();
  });

  it("treats null and undefined as the same absence", () => {
    expect(buildChangeSet({ note: null }, { note: null })).toBeNull();
  });

  it("catches a value being cleared", () => {
    const changes = buildChangeSet({ note: "algo" }, { note: null });
    expect(changes).toEqual({ note: { before: "algo", after: null } });
  });

  it("ignores fields the caller did not touch", () => {
    expect(buildChangeSet({ a: "x" }, { a: undefined })).toBeNull();
  });

  it("does not confuse a boolean with a number", () => {
    const changes = buildChangeSet({ flag: false }, { flag: true });
    expect(changes).not.toBeNull();
  });
});
