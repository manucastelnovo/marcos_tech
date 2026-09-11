# MarcosTech — Repair shop management

Management system for an electronics shop that repairs phones and tablets.
Phase 1 covers the repair core so the counter can stop using paper.

The application UI is in Spanish; code, comments and commits are in English.

## What Phase 1 does

- **Intake** on a single screen, designed so a device is recorded in 1–3 minutes.
- **Customers** created inline from the intake screen, searched by phone number.
- **Repair state machine** with ten states and enforced transitions.
- **14-item reception checklist**, every item optional.
- **Photo evidence**, compressed in the browser before upload.
- **Printable receipt with a QR code** that opens a public status page.
- **IMEI history and warranty**: a returning device is recognised at intake.
- **Dashboard** with today's intakes, open, urgent, ready and overdue work.
- **Three roles** (administrator, seller, technician) enforced server-side.
- **Audit trail** written in the same transaction as every change.

## What Phase 2A adds

- **Stock**: products with SKU, category, compatibility, minimum level and location.
- **An append-only movement ledger**, with the product's count as a transactional cache.
- **Weighted average cost**, frozen onto a repair the moment a part is consumed.
- **Serial tracking** for expensive parts, claimed once and released on return.
- **Real repair profitability**: price minus what the parts actually cost.
- **Stock alerts** on the dashboard, including counts that disagree with the shelf.

## What Phase 2B adds

- **Cash register** with one open session at a time, enforced by the database.
- **Per-currency reconciliation**: the drawer holds guaraníes, dollars, pesos and
  reales, and each is counted and balanced on its own with no conversion.
- **Repair payments** as their own rows, replacing the old single deposit column.
- **Expenses, withdrawals, refunds and corrections**, each with its own direction.
- **Exchange rates** as append-only history, admin only.

## What Phase 2C adds

- **Counter sales** that move stock, the till and the ledger in one transaction.
- **A point-of-sale screen** built for speed, like the intake screen.
- **Cross-currency selling**: a product priced in dollars can be sold in guaraníes
  at the configured rate, frozen onto the ticket.
- **Real margin per sale**, from costs frozen at the moment of sale.
- **Printable ticket**, and sales totals per currency on the dashboard.

## What Phase 2D adds

- **Quotes** as their own entity, for the customer who asks a price without
  leaving the device. Accepting one opens the work order and links the two.
- **Audit viewer**, admin only, over the trail every use case has written since
  Phase 1. Filterable by person, entity and action, with the field-level diff.
- **Profitability reports** by date range, per currency and converted to
  guaraníes using each record's own frozen rate.
- **Editable WhatsApp messages**, with the placeholders listed on screen.

That closes the client's specification. Still open: the WhatsApp Business API,
which Phase 1 deliberately replaced with prefilled wa.me links.

## Stack

Next.js 16 (App Router, Server Actions) · TypeScript · PostgreSQL · Prisma 7 ·
Auth.js v5 · Tailwind 4 · shadcn/ui on Base UI · Vitest.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate        # creates the schema
npm run db:seed           # users, device catalogue, WhatsApp templates
npm run dev
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Seeded accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | admin@marcostech.py | Admin-2026-MT |
| Seller | vendedor@marcostech.py | Vendedor-2026-MT |
| Technician | tecnico@marcostech.py | Tecnico-2026-MT |

Change these before the system reaches a real counter. There is no user
administration screen yet, so use the script:

```bash
npx tsx prisma/set-password.ts admin@marcostech.py
```

Step by step in [CONTRASENAS.md](./CONTRASENAS.md), in Spanish.

Deployment is documented in [DEPLOY.md](./DEPLOY.md), written in Spanish at the
owner's request.

### Photo storage

With `BLOB_READ_WRITE_TOKEN` set, photos go to Vercel Blob. Left empty, they are
written under `.local-blob/` and served through `/api/photos`, which requires a
session. Both sit behind the `PhotoStorage` port, so swapping to R2 or S3 means
writing one adapter.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit and integration tests |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed users and catalogue |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:studio` | Prisma Studio |

### Tests

Domain tests run in plain Node with no database. Integration tests exercise the
use cases against a real PostgreSQL, using a second database so a failing test
can never touch the shop's data. Create `.env.test` alongside `.env` with the
same shape, pointing `DATABASE_URL` at a separate database, then:

```bash
DATABASE_URL="<test database url>" npx prisma migrate deploy
npm test
```

## Architecture

Organised by business module, not by technical layer.

```
src/
  modules/
    repairs/      domain · application · infrastructure · ui
    customers/
    inventory/
    cash/
    sales/
    quotes/
    audit/
    reports/
    users/
  shared/         Money, dates, audit, auth, action results
  app/            routes only — thin, delegating to use cases
  components/ui/  shadcn primitives
```

`app/` and `ui/` never import Prisma; they call use cases. Use cases depend on
ports, not on Prisma types. Domain modules import nothing from infrastructure,
which is why they are unit-testable without a database.

### Decisions worth knowing before changing code

- **Money is never a float.** Amounts are `Decimal` plus a currency, parsed
  through `Money` in `src/shared/domain/money.ts`. `parseAmountInput` resolves
  "2.000.000" against the currency's own scale, because in guaraníes that is two
  million and in dollars it is one thousand two hundred and thirty-four.
- **Status transitions live in one table** in `repair-status.ts`. The UI renders
  what it allows and the use case re-checks it. `DELIVERED` is terminal: a
  warranty return becomes a new order so each order keeps its own profit record.
- **Order numbers come from an atomic counter**, incremented inside the same
  transaction that inserts the repair. Never from `count() + 1`.
- **The QR points to a random token**, not the order number. Sequential ids in a
  public URL would let anyone walk the shop's entire order book.
- **Audit rows are written in the same transaction as the change**, so a change
  cannot exist without its trail. Nothing is hard-deleted.
- **Times are stored in UTC and rendered in `America/Asuncion`.** This decides
  which day an intake belongs to, and in Phase 2 it decides the cash register.
- **The stock ledger is the truth, `Product.quantity` is a cache.** Both move in
  one transaction. A reconciliation query compares them and the product screen
  says so loudly when they disagree.
- **Inventory cost uses raw `Decimal`, not `Money`.** `Money` rounds to the
  currency scale on every operation, which is right for a price and wrong for an
  average. See `src/modules/inventory/domain/cost.ts`.
- **Stock may go negative.** The part was already used; refusing to record that
  makes the data worse. `ALLOW_NEGATIVE_STOCK` in `inventory/domain/product.ts`
  flips it to a hard block.
- **Only cash moves the drawer.** Transfers and cards are recorded as revenue and
  excluded from reconciliation by `movesTheDrawer` in `cash/domain`. Counting
  them would show a shortfall at every close.
- **Reconciliation never converts.** Each currency is balanced against its own
  physical count. Comparing counted dollars against an expectation in guaraníes
  would manufacture a discrepancy out of whatever rate happened to be set.
- **What a customer paid is the sum of `RepairPayment`,** not a column. The old
  `Repair.deposit` was backfilled and dropped, each step guarded by an assertion
  that ran in the same transaction as the change.
- **Amounts always render in Paraguayan convention,** whatever the currency:
  period for thousands, comma for decimals. Input accepts both.
- **Repairs and sales share one atomic counter,** keyed by series: `OT-2026-00001`
  and `VT-2026-00001` count independently. See `shared/infrastructure/counter.ts`.
- **Cross-currency conversion refuses rather than guesses.** With no rate
  configured, adding a dollar-priced product to a guaraní sale fails with a
  message pointing at the Monedas screen. A product silently priced at zero is
  far worse than a blocked sale.
- **Totals are never summed across currencies.** Dashboards and reports list one
  figure per currency, because a single mixed number would restate the past
  every time a rate moved.
- **The screen for exchange rates is called "Monedas", not "Cotizaciones".** In
  the client's spec that word also means a repair quote, and confusing the two
  in a demo is expensive. Repair quotes live under "Presupuestos".
- **Accepting a quote is terminal.** It creates a work order, and a second
  acceptance would create a second order for the same job. A rejection can be
  undone, because customers change their mind.
- **The audit viewer is read-only by construction.** There is no action that
  edits or deletes a log row: an audit log you can edit is not an audit log.
- **Reports convert with each record's own frozen rate, never today's.** Records
  with no rate stored are reported as a gap rather than folded in at a guess.
- **After changing the Prisma schema, restart `npm run dev`.** The client cached
  on `globalThis` predates the new models, and pages fail with
  `Cannot read properties of undefined`.
