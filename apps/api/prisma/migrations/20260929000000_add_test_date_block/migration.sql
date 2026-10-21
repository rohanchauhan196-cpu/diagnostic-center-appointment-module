-- CreateTable
-- Blocks all bookings for a specific (test, date) or (test, location, date) combo.
-- locationId NULL means block applies to ALL centers for that test on that date.
CREATE TABLE "TestDateBlock" (
    "id"          TEXT         NOT NULL,
    "testId"      TEXT         NOT NULL,
    "locationId"  TEXT,
    "date"        TIMESTAMP(3) NOT NULL,
    "reason"      TEXT,
    "createdById" TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestDateBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: fast lookup by testId + date
CREATE INDEX "TestDateBlock_testId_date_idx" ON "TestDateBlock"("testId", "date");

-- CreateIndex: prevent duplicate blocks for same test+location+date
CREATE UNIQUE INDEX "TestDateBlock_testId_locationId_date_key" ON "TestDateBlock"("testId", "locationId", "date");

-- AddForeignKey
ALTER TABLE "TestDateBlock" ADD CONSTRAINT "TestDateBlock_testId_fkey"
    FOREIGN KEY ("testId") REFERENCES "TestType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestDateBlock" ADD CONSTRAINT "TestDateBlock_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestDateBlock" ADD CONSTRAINT "TestDateBlock_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
