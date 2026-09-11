import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import { Money } from "@/shared/domain/money";
import { ForbiddenError, InvalidStatusTransitionError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { parseOrderNumber } from "../domain/order-number";
import { createRepair } from "./create-repair";
import { changeRepairStatus, deliverRepair } from "./change-status";
import { updatePricing } from "./update-repair";
import { findImeiHistory, getRepairDetail } from "./queries";
import { intakeSchema } from "./schemas";

const admin: CurrentUser = {
  id: "test-admin",
  email: "admin@test.local",
  name: "Admin Test",
  role: "ADMIN",
};

const seller: CurrentUser = {
  id: "test-seller",
  email: "seller@test.local",
  name: "Seller Test",
  role: "SELLER",
};

const technician: CurrentUser = {
  id: "test-technician",
  email: "tech@test.local",
  name: "Tech Test",
  role: "TECHNICIAN",
};

function intake(overrides: Record<string, unknown> = {}) {
  return intakeSchema.parse({
    customerPhone: "0981123456",
    customerName: "Cliente de Prueba",
    brandName: "Apple",
    modelName: "iPhone 13",
    reportedProblem: "No carga",
    currency: "PYG",
    ...overrides,
  });
}

beforeAll(async () => {
  for (const user of [admin, seller, technician]) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        role: user.role,
        passwordHash: "not-used-in-these-tests",
      },
      update: {},
    });
  }
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.counter.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, seller.id, technician.id] } } });
  await prisma.$disconnect();
});

describe("createRepair", () => {
  it("creates the customer, the order and its first status row in one go", async () => {
    const result = await createRepair(intake(), seller);

    expect(parseOrderNumber(result.orderNumber)).not.toBeNull();

    const detail = await getRepairDetail(result.repairId);
    expect(detail?.status).toBe("RECEIVED");
    expect(detail?.customer.fullName).toBe("Cliente de Prueba");
    expect(detail?.customer.phone).toBe("0981123456");
    expect(detail?.statusHistory).toHaveLength(1);
    expect(detail?.receivedBy.fullName).toBe(seller.name);
  });

  it("gives the public tracking page a token that is not the order number", async () => {
    const result = await createRepair(intake(), seller);
    const detail = await getRepairDetail(result.repairId);

    expect(detail?.publicToken).toBeTruthy();
    expect(detail?.publicToken).not.toBe(result.orderNumber);
    expect(detail?.publicToken).not.toContain(result.orderNumber);
    expect(detail!.publicToken.length).toBeGreaterThanOrEqual(20);
  });

  it("writes an audit row in the same transaction", async () => {
    const result = await createRepair(intake(), seller);

    const audit = await prisma.auditLog.findMany({
      where: { entityType: "Repair", entityId: result.repairId },
    });

    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("CREATE");
    expect(audit[0].actorId).toBe(seller.id);
    expect(audit[0].summary).toContain(result.orderNumber);
  });

  it("stores guaraníes without losing a single unit", async () => {
    const result = await createRepair(
      intake({ finalPrice: "2.000.000", deposit: "500.000", partsCost: "1.100.000" }),
      seller,
    );

    const detail = await getRepairDetail(result.repairId);

    // What matters is the value surviving the round trip and rendering the way
    // the counter typed it, not the exact string Prisma hands back.
    expect(Money.of(detail!.finalPrice!, "PYG").toDecimalString()).toBe("2000000");
    expect(Money.of(detail!.paidAmount, "PYG").toDecimalString()).toBe("500000");
    expect(Money.of(detail!.partsCost!, "PYG").toDecimalString()).toBe("1100000");
    expect(Money.of(detail!.finalPrice!, "PYG").format()).toBe("Gs. 2.000.000");
  });

  it("never hands two simultaneous intakes the same order number", async () => {
    // The reason the counter is an atomic UPDATE ... RETURNING and not count()+1.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        createRepair(intake({ customerPhone: `098100${String(index).padStart(4, "0")}` }), seller),
      ),
    );

    const orderNumbers = results.map((result) => result.orderNumber);
    expect(new Set(orderNumbers).size).toBe(orderNumbers.length);

    const sequences = orderNumbers
      .map((value) => parseOrderNumber(value)?.sequence)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("refuses to let a technician create an order", async () => {
    await expect(createRepair(intake(), technician)).rejects.toThrow(ForbiddenError);
  });
});

describe("permissions on the server, not in the UI", () => {
  it("rejects a technician posting a price change", async () => {
    const result = await createRepair(intake(), seller);

    await expect(
      updatePricing(
        {
          repairId: result.repairId,
          currency: "PYG",
          finalPrice: "5.000.000",
          partsCost: "",
          laborCost: "",
          exchangeRate: "",
        },
        technician,
      ),
    ).rejects.toThrow(ForbiddenError);

    const detail = await getRepairDetail(result.repairId);
    expect(detail?.finalPrice).toBeNull();
  });

  it("lets a seller change the price and records the diff", async () => {
    const result = await createRepair(intake({ finalPrice: "1.000.000" }), seller);

    await updatePricing(
      {
        repairId: result.repairId,
        currency: "PYG",
        finalPrice: "1.500.000",
        partsCost: "",
        laborCost: "",
        exchangeRate: "",
      },
      seller,
    );

    const detail = await getRepairDetail(result.repairId);
    expect(Money.of(detail!.finalPrice!, "PYG").toDecimalString()).toBe("1500000");

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: result.repairId, action: "PRICE_CHANGE" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.changes)).toContain("1500000");
  });

  it("does not record an audit row when nothing actually changed", async () => {
    const result = await createRepair(intake({ finalPrice: "1.000.000" }), seller);

    await updatePricing(
      {
        repairId: result.repairId,
        currency: "PYG",
        finalPrice: "1000000",
        partsCost: "",
        laborCost: "",
        exchangeRate: "",
      },
      seller,
    );

    const audit = await prisma.auditLog.findMany({
      where: { entityId: result.repairId, action: "PRICE_CHANGE" },
    });
    expect(audit).toHaveLength(0);
  });
});

describe("status transitions", () => {
  it("refuses an illegal jump", async () => {
    const result = await createRepair(intake(), seller);

    await expect(
      changeRepairStatus({ repairId: result.repairId, toStatus: "REPAIRED", note: "" }, seller),
    ).rejects.toThrow(InvalidStatusTransitionError);
  });

  it("records who moved the order and when", async () => {
    const result = await createRepair(intake(), seller);

    await changeRepairStatus(
      { repairId: result.repairId, toStatus: "IN_DIAGNOSIS", note: "Se revisa el pin" },
      technician,
    );

    const detail = await getRepairDetail(result.repairId);
    expect(detail?.status).toBe("IN_DIAGNOSIS");
    expect(detail?.statusHistory[0].toStatus).toBe("IN_DIAGNOSIS");
    expect(detail?.statusHistory[0].changedByName).toBe(technician.name);
    expect(detail?.statusHistory[0].note).toBe("Se revisa el pin");
  });

  it("routes delivery through its own use case so the warranty clock starts", async () => {
    const result = await createRepair(intake({ imei: "356938035643809" }), seller);

    await changeRepairStatus({ repairId: result.repairId, toStatus: "IN_REPAIR", note: "" }, seller);
    await changeRepairStatus({ repairId: result.repairId, toStatus: "REPAIRED", note: "" }, seller);
    await changeRepairStatus(
      { repairId: result.repairId, toStatus: "READY_FOR_PICKUP", note: "" },
      seller,
    );

    // A plain status change must not be able to close the order.
    await expect(
      changeRepairStatus({ repairId: result.repairId, toStatus: "DELIVERED", note: "" }, seller),
    ).rejects.toThrow();

    await deliverRepair({ repairId: result.repairId, warrantyDays: 90, note: "" }, seller);

    const detail = await getRepairDetail(result.repairId);
    expect(detail?.status).toBe("DELIVERED");
    expect(detail?.warrantyDays).toBe(90);
    expect(detail?.deliveredAt).toBeInstanceOf(Date);
  });

  it("treats delivered as terminal", async () => {
    const result = await createRepair(intake(), seller);
    await changeRepairStatus({ repairId: result.repairId, toStatus: "IN_REPAIR", note: "" }, seller);
    await changeRepairStatus({ repairId: result.repairId, toStatus: "REPAIRED", note: "" }, seller);
    await changeRepairStatus(
      { repairId: result.repairId, toStatus: "READY_FOR_PICKUP", note: "" },
      seller,
    );
    await deliverRepair({ repairId: result.repairId, warrantyDays: 30, note: "" }, seller);

    await expect(
      changeRepairStatus({ repairId: result.repairId, toStatus: "IN_REPAIR", note: "" }, admin),
    ).rejects.toThrow(InvalidStatusTransitionError);
  });
});

describe("IMEI history", () => {
  it("finds the previous visit of the same device", async () => {
    const imei = "356938035643809";
    const first = await createRepair(intake({ imei, reportedProblem: "Pantalla rota" }), seller);
    await createRepair(
      intake({ imei, customerPhone: "0982999888", reportedProblem: "No carga" }),
      seller,
    );

    const history = await findImeiHistory(imei);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.id)).toContain(first.repairId);
  });

  it("ignores case and whitespace around the IMEI", async () => {
    await createRepair(intake({ imei: "abc123def456" }), seller);

    const history = await findImeiHistory("  ABC123DEF456 ");
    expect(history).toHaveLength(1);
  });

  it("returns nothing for a fragment too short to identify a device", async () => {
    await createRepair(intake({ imei: "356938035643809" }), seller);
    expect(await findImeiHistory("3569")).toEqual([]);
  });
});
