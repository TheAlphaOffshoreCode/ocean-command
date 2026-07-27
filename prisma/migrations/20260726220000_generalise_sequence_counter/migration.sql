-- Generalises OperationCounter into SequenceCounter.
--
-- Alerts need codes (ALT-2026-0007) allocated the same way operations do, and
-- incidents will in phase 7. Three near-identical counter tables would be three
-- places to get the same concurrency argument wrong, so `kind` carries what the
-- table name used to.
--
-- Existing rows are carried over rather than dropped: the operation sequence must
-- continue where it left off, or the next created operation collides with an
-- existing code.

CREATE TABLE "SequenceCounter" (
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("organizationId", "kind", "year")
);

INSERT INTO "SequenceCounter" ("organizationId", "kind", "year", "lastSequence")
SELECT "organizationId", 'OPERATION', "year", "lastSequence"
FROM "OperationCounter";

DROP TABLE "OperationCounter";
