-- Data migration: the `deposit` column becomes the sum of RepairPayment rows.
--
-- One payment row per repair that already carries a deposit. The original
-- valuation travels with it: same currency, same frozen exchange rate, credited
-- to whoever received the device, dated when the device was received.
--
-- `sessionId` stays null because these predate the cash register entirely.
INSERT INTO "RepairPayment" (
  "id", "repairId", "amount", "currency", "exchangeRate", "method",
  "sessionId", "actorId", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  r."id",
  r."deposit",
  r."currency",
  r."exchangeRate",
  'CASH'::"PaymentMethod",
  NULL,
  r."receivedById",
  r."receivedAt"
FROM "Repair" r
WHERE r."deposit" > 0;

-- Proof, inside the same transaction as the backfill.
--
-- If a single repair's payments fail to reproduce its old deposit exactly, this
-- raises and the whole migration rolls back. The column is only dropped by the
-- next migration, which cannot run unless this one committed.
DO $$
DECLARE
  mismatched integer;
BEGIN
  SELECT COUNT(*) INTO mismatched
  FROM "Repair" r
  LEFT JOIN (
    SELECT "repairId", SUM("amount") AS paid
    FROM "RepairPayment"
    GROUP BY "repairId"
  ) p ON p."repairId" = r."id"
  WHERE r."deposit" <> COALESCE(p.paid, 0);

  IF mismatched > 0 THEN
    RAISE EXCEPTION
      'Backfill incompleto: % reparaciones no reproducen su seña original', mismatched;
  END IF;
END $$;
