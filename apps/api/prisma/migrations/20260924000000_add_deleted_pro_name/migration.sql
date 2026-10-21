-- CreateTable: Track PRO names explicitly deleted by admins
-- so the seed script never restores them on server restart.
CREATE TABLE "DeletedProName" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedProName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletedProName_name_key" ON "DeletedProName"("name");
