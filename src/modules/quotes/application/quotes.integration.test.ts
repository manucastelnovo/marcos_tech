import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import { Money } from "@/shared/domain/money";
import { BusinessRuleError, ForbiddenError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { getRepairDetail } from "@/modules/repairs/application/queries";
import { parseOrderNumber } from "@/modules/repairs/domain/order-number";
import { setExchangeRate } from "@/modules/cash/application/exchange-rates";
import { parseQuoteNumber } from "../domain/quote";
import { acceptQuote, changeQuoteStatus, createQuote, updateQuote } from "./commands";
import { getQuoteDetail, countPendingQuotes, listQuotes } from "./queries";

const admin: CurrentUser = {
  id: "quote-admin",
  email: "admin@quote.local",
  name: "Admin Quote",
  role: "ADMIN",
};

const seller: CurrentUser = {
  id: "quote-seller",
  email: "seller@quote.local",
  name: "Seller Quote",
  role: "SELLER",
};

const technician: CurrentUser = {
  id: "quote-tech",
  email: "tech@quote.local",
  name: "Tech Quote",
  role: "TECHNICIAN",
};

function quoteInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: "",
    customerName: "Juan Pérez",
    customerPhone: "0981123456",
    brandName: "Apple",
    modelName: "iPhone 13",
    description: "Cambio de pantalla",
    currency: "PYG" as const,
    partsCost: "1.100.000",
    laborCost: "400.000",
    validDays: 15,
    notes: "",
    ...overrides,
  };
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
  await prisma.quote.deleteMany();
  await prisma.repairPayment.deleteMany();
  await prisma.repairPart.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.counter.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, seller.id, technician.id] } },
  });
  await prisma.$disconnect();
});

describe("createQuote", () => {
  it("totals parts plus labour, the way the client wrote the example", async () => {
    const quote = await createQuote(quoteInput(), seller);
    const detail = await getQuoteDetail(quote.id);

    expect(parseQuoteNumber(quote.number)).not.toBeNull();
    expect(detail?.total).toBe("1500000");
    expect(detail?.status).toBe("PENDING");
  });

  it("does not need a customer record, only what the walk-in said", async () => {
    const quote = await createQuote(
      quoteInput({ customerName: "Señora del Nokia", customerPhone: "" }),
      seller,
    );

    const detail = await getQuoteDetail(quote.id);
    expect(detail?.customerId).toBeNull();
    expect(detail?.customerLabel).toBe("Señora del Nokia");
    expect(await prisma.customer.count()).toBe(0);
  });

  it("freezes the rate when the quote is in another currency", async () => {
    await setExchangeRate({ currency: "USD", rate: "7350" }, admin);
    const quote = await createQuote(
      quoteInput({ currency: "USD", partsCost: "80", laborCost: "20" }),
      seller,
    );

    await setExchangeRate({ currency: "USD", rate: "7600" }, admin);

    const detail = await getQuoteDetail(quote.id);
    // Compared through Money rather than as a raw string: Prisma normalises the
    // decimal on the way back, and what matters is the value.
    expect(Money.of(detail!.total, "USD").format()).toBe("USD 100,00");
    expect(detail?.exchangeRate).toBe("7350");
  });

  it("rejects a technician", async () => {
    await expect(createQuote(quoteInput(), technician)).rejects.toThrow(ForbiddenError);
  });
});

describe("answering a quote", () => {
  it("records a rejection and lets the customer come back", async () => {
    const quote = await createQuote(quoteInput(), seller);

    await changeQuoteStatus({ quoteId: quote.id, status: "REJECTED" }, seller);
    expect((await getQuoteDetail(quote.id))?.status).toBe("REJECTED");

    await changeQuoteStatus({ quoteId: quote.id, status: "PENDING" }, seller);
    expect((await getQuoteDetail(quote.id))?.status).toBe("PENDING");
  });

  it("refuses to accept through the plain status change", async () => {
    const quote = await createQuote(quoteInput(), seller);

    await expect(
      changeQuoteStatus({ quoteId: quote.id, status: "ACCEPTED" }, seller),
    ).rejects.toThrow(BusinessRuleError);
  });
});

describe("acceptQuote", () => {
  it("creates the customer and the work order with the quoted prices", async () => {
    const quote = await createQuote(quoteInput(), seller);

    const result = await acceptQuote(
      { quoteId: quote.id, customerName: "Juan Pérez", customerPhone: "0981123456" },
      seller,
    );

    expect(parseOrderNumber(result.orderNumber)).not.toBeNull();

    const repair = await getRepairDetail(result.repairId);
    expect(repair?.brandName).toBe("Apple");
    expect(repair?.reportedProblem).toBe("Cambio de pantalla");
    expect(repair?.finalPrice).toBe("1500000");
    expect(repair?.partsCost).toBe("1100000");
    expect(repair?.customer.fullName).toBe("Juan Pérez");
    expect(repair?.customer.phone).toBe("0981123456");
    expect(repair?.statusHistory).toHaveLength(1);

    const detail = await getQuoteDetail(quote.id);
    expect(detail?.status).toBe("ACCEPTED");
    expect(detail?.convertedRepairId).toBe(result.repairId);
    expect(detail?.convertedOrderNumber).toBe(result.orderNumber);
  });

  it("reuses an existing customer instead of duplicating them", async () => {
    const customer = await prisma.customer.create({
      data: { fullName: "Cliente Viejo", phone: "0981999888" },
    });

    const quote = await createQuote(quoteInput({ customerId: customer.id }), seller);
    const result = await acceptQuote({ quoteId: quote.id, customerName: "", customerPhone: "" }, seller);

    const repair = await getRepairDetail(result.repairId);
    expect(repair?.customer.id).toBe(customer.id);
    expect(await prisma.customer.count()).toBe(1);
  });

  it("refuses without a phone, because the order needs someone to call", async () => {
    const quote = await createQuote(
      quoteInput({ customerName: "Sin teléfono", customerPhone: "" }),
      seller,
    );

    await expect(
      acceptQuote({ quoteId: quote.id, customerName: "", customerPhone: "" }, seller),
    ).rejects.toThrow(/teléfono/i);
  });

  it("cannot be accepted twice, so a second order is impossible", async () => {
    const quote = await createQuote(quoteInput(), seller);
    await acceptQuote({ quoteId: quote.id, customerName: "", customerPhone: "" }, seller);

    await expect(
      acceptQuote({ quoteId: quote.id, customerName: "", customerPhone: "" }, seller),
    ).rejects.toThrow(BusinessRuleError);

    expect(await prisma.repair.count()).toBe(1);
  });

  it("freezes the quote once accepted", async () => {
    const quote = await createQuote(quoteInput(), seller);
    await acceptQuote({ quoteId: quote.id, customerName: "", customerPhone: "" }, seller);

    await expect(
      updateQuote({ ...quoteInput(), quoteId: quote.id, partsCost: "9.000.000" }, seller),
    ).rejects.toThrow(/aceptado/i);
  });

  it("writes both audit rows, for the quote and for the order", async () => {
    const quote = await createQuote(quoteInput(), seller);
    const result = await acceptQuote({ quoteId: quote.id, customerName: "", customerPhone: "" }, seller);

    const quoteAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Quote", entityId: quote.id, action: "STATUS_CHANGE" },
    });
    const repairAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Repair", entityId: result.repairId, action: "CREATE" },
    });

    expect(quoteAudit?.summary).toContain(result.orderNumber);
    expect(repairAudit?.summary).toContain(quote.number);
  });
});

describe("listing", () => {
  it("counts only what is still waiting for an answer", async () => {
    const first = await createQuote(quoteInput(), seller);
    await createQuote(quoteInput({ customerPhone: "0981777666" }), seller);
    await changeQuoteStatus({ quoteId: first.id, status: "REJECTED" }, seller);

    expect(await countPendingQuotes()).toBe(1);
    expect(await listQuotes({ status: "PENDING" })).toHaveLength(1);
    expect(await listQuotes({ status: "REJECTED" })).toHaveLength(1);
  });

  it("finds a quote by the phone the walk-in gave", async () => {
    await createQuote(quoteInput(), seller);
    expect(await listQuotes({ search: "0981 123456" })).toHaveLength(1);
  });
});
