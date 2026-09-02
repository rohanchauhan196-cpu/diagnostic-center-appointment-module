const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Connecting to database to migrate paymentMethod data...");
  try {
    // Run raw SQL queries to check and migrate the data
    const res = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='Appointment' AND column_name='paymentMethod'
    `);
    
    if (res && res.length > 0) {
      console.log("Found 'paymentMethod' column. Ensuring new columns exist...");
      await prisma.$executeRawUnsafe('ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "advanceMethod" text');
      await prisma.$executeRawUnsafe('ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "remainingMethod" text');
      
      console.log("Copying data from 'paymentMethod' to 'advanceMethod'...");
      const updatedCount = await prisma.$executeRawUnsafe(`
        UPDATE "Appointment" 
        SET "advanceMethod" = "paymentMethod" 
        WHERE "advanceMethod" IS NULL AND "paymentMethod" IS NOT NULL
      `);
      console.log(`Successfully migrated ${updatedCount} rows.`);
    } else {
      console.log("'paymentMethod' column already dropped or does not exist. Skipping data migration.");
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
