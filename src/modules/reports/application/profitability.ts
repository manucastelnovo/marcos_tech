import "server-only";
import Decimal from "decimal.js";
import { prisma } from "@/shared/infrastructure/prisma";
import { Money, type Currency } from "@/shared/domain/money";

export type CurrencyBreakdown = {
  currency: Currency;
  revenue: string;
  cost: string;
  margin: string;
  count: number;
};

export type ProfitabilitySection = {
  byCurrency: CurrencyBreakdown[];
  /**
   * Everything expressed in guaraníes using each record's own frozen rate.
   * This is history, not today's rate: a record priced at 7.350 stays at 7.350
   * however the dollar moves afterwards.
   */
  guaraniRevenue: string;
  guaraniCost: string;
  guaraniMargin: string;
  /** Records that carry no rate and therefore could not be converted. */
  unconvertible: number;
};

export type ProfitabilityReport = {
  from: Date;
  to: Date;
  repairs: ProfitabilitySection;
  sales: ProfitabilitySection;
};

type Row = {
  currency: Currency;
  exchangeRate: string | null;
  revenue: Decimal;
  cost: Decimal;
};

export async function getProfitability(from: Date, to: Date): Promise<ProfitabilityReport> {
  const [repairRows, saleRows] = await Promise.all([loadRepairs(from, to), loadSales(from, to)]);

  return {
    from,
    to,
    repairs: summarise(repairRows),
    sales: summarise(saleRows),
  };
}

/**
 * A repair earns its final price and costs what its parts actually cost, taken
 * from the frozen `RepairPart.unitCost`. Only delivered work counts: an order
 * still on the bench has not earned anything yet.
 */
async function loadRepairs(from: Date, to: Date): Promise<Row[]> {
  const repairs = await prisma.repair.findMany({
    where: {
      deletedAt: null,
      status: "DELIVERED",
      deliveredAt: { gte: from, lt: to },
    },
    select: {
      currency: true,
      exchangeRate: true,
      finalPrice: true,
      parts: { select: { quantity: true, unitCost: true, currency: true } },
    },
  });

  return repairs.map((repair) => ({
    currency: repair.currency,
    exchangeRate: repair.exchangeRate?.toString() ?? null,
    revenue: new Decimal(repair.finalPrice?.toString() ?? "0"),
    // Parts costed in another currency are left out of this figure rather than
    // converted twice; they are rare and would distort the per-currency view.
    cost: repair.parts
      .filter((part) => part.currency === repair.currency)
      .reduce(
        (total, part) => total.plus(new Decimal(part.unitCost.toString()).times(part.quantity)),
        new Decimal(0),
      ),
  }));
}

async function loadSales(from: Date, to: Date): Promise<Row[]> {
  const sales = await prisma.sale.findMany({
    where: { deletedAt: null, createdAt: { gte: from, lt: to } },
    select: {
      currency: true,
      exchangeRate: true,
      total: true,
      lines: { select: { quantity: true, unitCost: true } },
    },
  });

  return sales.map((sale) => ({
    currency: sale.currency,
    exchangeRate: sale.exchangeRate?.toString() ?? null,
    revenue: new Decimal(sale.total.toString()),
    cost: sale.lines.reduce(
      (total, line) => total.plus(new Decimal(line.unitCost.toString()).times(line.quantity)),
      new Decimal(0),
    ),
  }));
}

function summarise(rows: Row[]): ProfitabilitySection {
  const buckets = new Map<Currency, { revenue: Decimal; cost: Decimal; count: number }>();

  let guaraniRevenue = new Decimal(0);
  let guaraniCost = new Decimal(0);
  let unconvertible = 0;

  for (const row of rows) {
    const bucket = buckets.get(row.currency) ?? {
      revenue: new Decimal(0),
      cost: new Decimal(0),
      count: 0,
    };
    bucket.revenue = bucket.revenue.plus(row.revenue);
    bucket.cost = bucket.cost.plus(row.cost);
    bucket.count += 1;
    buckets.set(row.currency, bucket);

    if (row.currency === "PYG") {
      guaraniRevenue = guaraniRevenue.plus(row.revenue);
      guaraniCost = guaraniCost.plus(row.cost);
      continue;
    }

    if (!row.exchangeRate) {
      // No rate was recorded, so there is no honest way to express this in
      // guaraníes. It is reported as a gap rather than folded in at a guess.
      unconvertible += 1;
      continue;
    }

    const rate = new Decimal(row.exchangeRate);
    guaraniRevenue = guaraniRevenue.plus(row.revenue.times(rate));
    guaraniCost = guaraniCost.plus(row.cost.times(rate));
  }

  const byCurrency: CurrencyBreakdown[] = [...buckets.entries()].map(([currency, bucket]) => ({
    currency,
    revenue: Money.of(bucket.revenue, currency).toDecimalString(),
    cost: Money.of(bucket.cost, currency).toDecimalString(),
    margin: Money.of(bucket.revenue.minus(bucket.cost), currency).toDecimalString(),
    count: bucket.count,
  }));

  return {
    byCurrency,
    guaraniRevenue: Money.of(guaraniRevenue, "PYG").toDecimalString(),
    guaraniCost: Money.of(guaraniCost, "PYG").toDecimalString(),
    guaraniMargin: Money.of(guaraniRevenue.minus(guaraniCost), "PYG").toDecimalString(),
    unconvertible,
  };
}

/** Top products by units sold in the range, for the shelf that pays the rent. */
export async function getTopProducts(from: Date, to: Date, take = 10) {
  const grouped = await prisma.saleLine.groupBy({
    by: ["productId", "description"],
    where: { sale: { deletedAt: null, createdAt: { gte: from, lt: to } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take,
  });

  return grouped.map((row) => ({
    productId: row.productId,
    description: row.description,
    quantity: row._sum.quantity ?? 0,
  }));
}
