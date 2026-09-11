-- Moves the repair sequence into the generalised Counter table.
--
-- Sales need their own series, so the counter gains a key. The repair numbers
-- already handed to customers must keep counting from where they were: losing
-- this would hand OT-2026-00001 to a second device.
INSERT INTO "Counter" ("key", "year", "value")
SELECT 'repair', o."year", o."value"
FROM "OrderCounter" o
ON CONFLICT ("key", "year") DO UPDATE SET "value" = EXCLUDED."value";

-- Proof, in the same transaction: every year must have carried across with its
-- value intact before the old table is allowed to go.
DO $$
DECLARE
  missing integer;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM "OrderCounter" o
  LEFT JOIN "Counter" c ON c."key" = 'repair' AND c."year" = o."year"
  WHERE c."value" IS DISTINCT FROM o."value";

  IF missing > 0 THEN
    RAISE EXCEPTION 'Secuencia de órdenes no migrada: % años no coinciden', missing;
  END IF;
END $$;
