-- CreateTable
CREATE TABLE "OperationCounter" (
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OperationCounter_pkey" PRIMARY KEY ("organizationId","year")
);
