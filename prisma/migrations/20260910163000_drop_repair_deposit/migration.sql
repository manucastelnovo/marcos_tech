-- Drops `Repair.deposit`. What a customer paid is now the sum of RepairPayment.
--
-- The previous migration backfilled the payments and proved they reproduce every
-- deposit. This one proves it again immediately before the drop, in the same
-- transaction, because the two migrations may be minutes or months apart and
-- rows can be written in between.
--
-- Written by hand rather than generated: Prisma refuses to author a destructive
-- change non-interactively, and the guard below is the reason this drop is safe.
DO $$
DECLARE
  unbacked integer;
BEGIN
  SELECT COUNT(*) INTO unbacked
  FROM "Repair" r
  LEFT JOIN (
    SELECT "repairId", SUM("amount") AS paid
    FROM "RepairPayment"
    GROUP BY "repairId"
  ) p ON p."repairId" = r."id"
  WHERE r."deposit" <> COALESCE(p.paid, 0);

  IF unbacked > 0 THEN
    RAISE EXCEPTION
      'No se borra deposit: % reparaciones no están respaldadas por sus pagos', unbacked;
  END IF;
END $$;

ALTER TABLE "Repair" DROP COLUMN "deposit";
