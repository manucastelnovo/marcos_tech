-- Drops OrderCounter, superseded by the keyed Counter table.
--
-- The previous migration copied the repair sequence across. This proves it
-- again immediately before the drop, in the same transaction, because losing a
-- counter means reissuing an order number that a customer already holds.
--
-- Written by hand: Prisma refuses to author destructive changes non-interactively.
DO $$
DECLARE
  unmigrated integer;
BEGIN
  SELECT COUNT(*) INTO unmigrated
  FROM "OrderCounter" o
  LEFT JOIN "Counter" c ON c."key" = 'repair' AND c."year" = o."year"
  WHERE c."value" IS DISTINCT FROM o."value";

  IF unmigrated > 0 THEN
    RAISE EXCEPTION 'No se borra OrderCounter: % años sin migrar', unmigrated;
  END IF;
END $$;

DROP TABLE "OrderCounter";
