-- CreateEnum
CREATE TYPE "AppointmentStatus_new" AS ENUM ('BOOKED', 'ON_THE_WAY', 'ARRIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Appointment" ALTER COLUMN "status" TYPE "AppointmentStatus_new" USING ("status"::text::"AppointmentStatus_new");
ALTER TABLE "StatusHistory" ALTER COLUMN "fromStatus" TYPE "AppointmentStatus_new" USING ("fromStatus"::text::"AppointmentStatus_new");
ALTER TABLE "StatusHistory" ALTER COLUMN "toStatus" TYPE "AppointmentStatus_new" USING ("toStatus"::text::"AppointmentStatus_new");

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'BOOKED';

-- DropEnum
DROP TYPE "AppointmentStatus";

-- RenameEnum
ALTER TYPE "AppointmentStatus_new" RENAME TO "AppointmentStatus";
