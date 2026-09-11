import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import { ForbiddenError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { createRepair } from "@/modules/repairs/application/create-repair";
import { intakeSchema } from "@/modules/repairs/application/schemas";
import { getRepairDetail } from "@/modules/repairs/application/queries";
import { closeCashSession, openCashSession } from "./session";
import { payRepair, registerCashMovement } from "./movements";
import { getOpenCashSession, listRepairPayments } from "./queries";
import { setExchangeRate } from "./exchange-rates";

const admin: CurrentUser = {
  id: "cash-admin",
  email: "admin@cash.local",
  name: "Admin Cash",
  role: "ADMIN",
};

const seller: CurrentUser = {
  id: "cash-seller",
  email: "seller@cash.local",
  name: "Seller Cash",
  role: "SELLER",
};

const technician: CurrentUser = {
  id: "cash-tech",
  email: "tech@cash.local",
  name: "Tech Cash",
  role: "TECHNICIAN",
};

async function newRepair(overrides: Record<string, unknown> = {}) {
  return createRepair(
    intakeSchema.parse({
      customerPhone: `0981${Math.floor(100000 + Math.random() * 899999)}`,
      customerName: "Cliente Caja",
      brandName: "Apple",
      modelName: "iPhone 13",
      reportedProblem: "No carga",
      currency: "PYG",
      finalPrice: "2.000.000",
      ...overrides,
    }),
    seller,
  );
}

function line(session: Awaited<ReturnType<typeof getOpenCashSession>>, currency: string) {
  return session?.lines.find((entry) => entry.currency === currency);
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
        passwordHash: "not-used",
      },
      update: {},
    });
  }
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.repairPayment.deleteMany();
  await prisma.cashCount.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.repairPart.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockSerial.deleteMany();
  await prisma.product.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.counter.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.repairPayment.deleteMany();
  await prisma.cashCount.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, seller.id, technician.id] } },
  });
  await prisma.$disconnect();
});

describe("opening the register", () => {
  it("records the opening count per currency", async () => {
    await openCashSession(
      {
        counts: [
          { currency: "PYG", amount: "500.000" },
          { currency: "USD", amount: "100" },
        ],
        notes: "Turno mañana",
      },
      seller,
    );

    const session = await getOpenCashSession();
    expect(session).not.toBeNull();
    expect(line(session, "PYG")?.opening).toBe("500000");
    expect(line(session, "USD")?.opening).toBe("100.00");
  });

  it("refuses to open a second register while one is open", async () => {
    await openCashSession({ counts: [], notes: "" }, seller);

    await expect(openCashSession({ counts: [], notes: "" }, admin)).rejects.toThrow(
      /ya hay una caja abierta/i,
    );
  });

  it("lets a new register open once the previous one closed", async () => {
    const first = await openCashSession({ counts: [], notes: "" }, seller);
    await closeCashSession({ sessionId: first.id, counts: [], notes: "" }, seller);

    const second = await openCashSession({ counts: [], notes: "" }, seller);
    expect(second.id).not.toBe(first.id);
  });

  it("rejects a technician", async () => {
    await expect(openCashSession({ counts: [], notes: "" }, technician)).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("what the drawer should hold", () => {
  it("adds cash movements to the opening count", async () => {
    await openCashSession({ counts: [{ currency: "PYG", amount: "500.000" }], notes: "" }, seller);
    const repair = await newRepair();

    await payRepair(
      { repairId: repair.repairId, amount: "1.000.000", currency: "PYG", method: "CASH", description: "" },
      seller,
    );
    await registerCashMovement(
      { type: "EXPENSE", amount: "200.000", currency: "PYG", method: "CASH", description: "Insumos" },
      seller,
    );

    const session = await getOpenCashSession();
    expect(line(session, "PYG")?.expected).toBe("1300000");
  });

  it("ignores transfers and cards, which never enter the drawer", async () => {
    await openCashSession({ counts: [{ currency: "PYG", amount: "100.000" }], notes: "" }, seller);
    const repair = await newRepair();

    await payRepair(
      { repairId: repair.repairId, amount: "900.000", currency: "PYG", method: "TRANSFER", description: "" },
      seller,
    );

    const session = await getOpenCashSession();
    // The money is real revenue and appears in the movement list...
    expect(session?.movements).toHaveLength(1);
    // ...but nobody put it in the drawer, so the expected cash is unchanged.
    expect(line(session, "PYG")?.expected).toBe("100000");
  });

  it("keeps each currency separate instead of converting", async () => {
    await setExchangeRate({ currency: "USD", rate: "7350" }, admin);
    await openCashSession(
      {
        counts: [
          { currency: "PYG", amount: "500.000" },
          { currency: "USD", amount: "50" },
        ],
        notes: "",
      },
      seller,
    );
    const repair = await newRepair();

    await payRepair(
      { repairId: repair.repairId, amount: "100", currency: "USD", method: "CASH", description: "" },
      seller,
    );

    const session = await getOpenCashSession();
    expect(line(session, "USD")?.expected).toBe("150.00");
    // The dollar payment must not leak into the guaraní expectation.
    expect(line(session, "PYG")?.expected).toBe("500000");
  });

  it("freezes the rate a foreign payment was taken at", async () => {
    await setExchangeRate({ currency: "USD", rate: "7350" }, admin);
    await openCashSession({ counts: [], notes: "" }, seller);
    const repair = await newRepair();

    await payRepair(
      { repairId: repair.repairId, amount: "100", currency: "USD", method: "CASH", description: "" },
      seller,
    );

    await setExchangeRate({ currency: "USD", rate: "7600" }, admin);

    const payment = await prisma.repairPayment.findFirstOrThrow({
      where: { repairId: repair.repairId },
    });
    expect(payment.exchangeRate?.toString()).toBe("7350");
  });
});

describe("charging a repair", () => {
  it("adds up several payments into what the customer has paid", async () => {
    await openCashSession({ counts: [], notes: "" }, seller);
    const repair = await newRepair();

    await payRepair(
      { repairId: repair.repairId, amount: "500.000", currency: "PYG", method: "CASH", description: "" },
      seller,
    );
    await payRepair(
      { repairId: repair.repairId, amount: "1.500.000", currency: "PYG", method: "CASH", description: "" },
      seller,
    );

    const detail = await getRepairDetail(repair.repairId);
    expect(detail?.paidAmount).toBe("2000000");
    expect(await listRepairPayments(repair.repairId)).toHaveLength(2);
  });

  it("turns the intake deposit into the first payment", async () => {
    await openCashSession({ counts: [], notes: "" }, seller);
    const repair = await newRepair({ deposit: "500.000" });

    const payments = await listRepairPayments(repair.repairId);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe("500000");
    expect(payments[0].insideSession).toBe(true);

    const session = await getOpenCashSession();
    expect(line(session, "PYG")?.expected).toBe("500000");
  });

  it("still records money taken with no register open, and says so", async () => {
    const repair = await newRepair();

    await payRepair(
      { repairId: repair.repairId, amount: "300.000", currency: "PYG", method: "CASH", description: "" },
      seller,
    );

    const payments = await listRepairPayments(repair.repairId);
    expect(payments).toHaveLength(1);
    expect(payments[0].insideSession).toBe(false);

    await openCashSession({ counts: [], notes: "" }, seller);
    const session = await getOpenCashSession();
    expect(session?.paymentsOutside).toHaveLength(1);
    // It was never in this drawer, so it must not inflate the expectation.
    expect(line(session, "PYG")).toBeUndefined();
  });

  it("rejects a technician", async () => {
    await openCashSession({ counts: [], notes: "" }, seller);
    const repair = await newRepair();

    await expect(
      payRepair(
        { repairId: repair.repairId, amount: "1000", currency: "PYG", method: "CASH", description: "" },
        technician,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuses a movement when no register is open", async () => {
    await expect(
      registerCashMovement(
        { type: "EXPENSE", amount: "1000", currency: "PYG", method: "CASH", description: "x" },
        seller,
      ),
    ).rejects.toThrow(/no hay ninguna caja abierta/i);
  });
});

describe("closing the register", () => {
  it("reports no difference when the count matches", async () => {
    const session = await openCashSession(
      { counts: [{ currency: "PYG", amount: "500.000" }], notes: "" },
      seller,
    );
    const repair = await newRepair();
    await payRepair(
      { repairId: repair.repairId, amount: "1.000.000", currency: "PYG", method: "CASH", description: "" },
      seller,
    );

    const result = await closeCashSession(
      { sessionId: session.id, counts: [{ currency: "PYG", amount: "1.500.000" }], notes: "" },
      seller,
    );

    const pyg = result.lines.find((entry) => entry.currency === "PYG");
    expect(pyg?.expected).toBe("1500000");
    expect(pyg?.counted).toBe("1500000");
    expect(pyg?.difference).toBe("0");
  });

  it("records a shortfall rather than blocking the close", async () => {
    const session = await openCashSession({ counts: [], notes: "" }, seller);
    const repair = await newRepair();
    await payRepair(
      { repairId: repair.repairId, amount: "1.000.000", currency: "PYG", method: "CASH", description: "" },
      seller,
    );

    const result = await closeCashSession(
      { sessionId: session.id, counts: [{ currency: "PYG", amount: "950.000" }], notes: "Faltó plata" },
      seller,
    );

    expect(result.lines[0].difference).toBe("-50000");
    expect(await getOpenCashSession()).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "CashSession", entityId: session.id, action: "UPDATE" },
    });
    expect(audit?.summary).toMatch(/diferencia/i);
    expect(audit?.actorId).toBe(seller.id);
  });

  it("reconciles each currency on its own", async () => {
    const session = await openCashSession(
      {
        counts: [
          { currency: "PYG", amount: "100.000" },
          { currency: "USD", amount: "20" },
        ],
        notes: "",
      },
      seller,
    );
    const repair = await newRepair();
    await payRepair(
      { repairId: repair.repairId, amount: "50", currency: "USD", method: "CASH", description: "" },
      seller,
    );

    const result = await closeCashSession(
      {
        sessionId: session.id,
        counts: [
          { currency: "PYG", amount: "100.000" },
          { currency: "USD", amount: "65" },
        ],
        notes: "",
      },
      seller,
    );

    const pyg = result.lines.find((entry) => entry.currency === "PYG");
    const usd = result.lines.find((entry) => entry.currency === "USD");
    expect(pyg?.difference).toBe("0");
    expect(usd?.difference).toBe("-5.00");
  });

  it("refuses to close a register twice", async () => {
    const session = await openCashSession({ counts: [], notes: "" }, seller);
    await closeCashSession({ sessionId: session.id, counts: [], notes: "" }, seller);

    await expect(
      closeCashSession({ sessionId: session.id, counts: [], notes: "" }, seller),
    ).rejects.toThrow(/ya fue cerrada/i);
  });

  it("rejects a technician", async () => {
    const session = await openCashSession({ counts: [], notes: "" }, seller);
    await expect(
      closeCashSession({ sessionId: session.id, counts: [], notes: "" }, technician),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("exchange rates", () => {
  it("keeps history instead of overwriting", async () => {
    await setExchangeRate({ currency: "USD", rate: "7350" }, admin);
    await setExchangeRate({ currency: "USD", rate: "7400" }, admin);

    const rows = await prisma.exchangeRate.findMany({ where: { currency: "USD" } });
    expect(rows).toHaveLength(2);
  });

  it("only the administrator may set them", async () => {
    await expect(setExchangeRate({ currency: "USD", rate: "7350" }, seller)).rejects.toThrow(
      ForbiddenError,
    );
  });
});
