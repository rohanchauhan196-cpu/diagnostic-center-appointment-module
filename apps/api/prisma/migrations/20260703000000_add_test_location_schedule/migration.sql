-- CreateTable: TestLocationSchedule
-- Adds per-center working days configuration.
-- This is purely additive — no existing data is changed.
-- All existing TestType.workDays and SlotConfiguration rows are fully preserved.

CREATE TABLE "TestLocationSchedule" (
    "id"         TEXT NOT NULL,
    "testId"     TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "workDays"   TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "TestLocationSchedule_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex so each (test, center) pair has exactly one schedule row
CREATE UNIQUE INDEX "TestLocationSchedule_testId_locationId_key"
    ON "TestLocationSchedule"("testId", "locationId");

-- FK to TestType
ALTER TABLE "TestLocationSchedule"
    ADD CONSTRAINT "TestLocationSchedule_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "TestType"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK to Location
ALTER TABLE "TestLocationSchedule"
    ADD CONSTRAINT "TestLocationSchedule_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
