import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const slotSets = {
  "PET CT SCAN": [
    ["7:30 AM", 10], ["8:00 AM", 2], ["8:30 AM", 4], ["9:00 AM", 3], ["9:30 AM", 3],
    ["10:00 AM", 3], ["10:30 AM", 3], ["11:00 AM", 4], ["11:30 AM", 4], ["12:00 PM", 4], ["12:30 PM", 5]
  ],
  DTPA: [["8:30 AM", 2], ["9:00 AM", 2], ["10:00 AM", 3], ["11:00 AM", 2], ["12:30 PM", 2]],
  "PSMA/DOTA": [["12:30 PM - 1:00 PM", 4]]
} as const;

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@diagnostic.local" },
    update: {},
    create: {
      email: "admin@diagnostic.local",
      name: "System Admin",
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash("Admin@12345", 12)
    }
  });

  const gwalior = await prisma.location.upsert({
    where: { name: "Gwalior Center" },
    update: {},
    create: { name: "Gwalior Center" }
  });

  const delhi = await prisma.location.upsert({
    where: { name: "Delhi Center" },
    update: {},
    create: { name: "Delhi Center" }
  });

  for (const [name, slots] of Object.entries(slotSets)) {
    const test = await prisma.testType.upsert({ where: { name }, update: {}, create: { name } });
    for (const [index, [label, capacity]] of slots.entries()) {
      await prisma.slotConfiguration.upsert({
        where: { testId_locationId_dayOfWeek_label: { testId: test.id, locationId: gwalior.id, dayOfWeek: "All", label } },
        update: { capacity, sortOrder: index },
        create: { testId: test.id, locationId: gwalior.id, dayOfWeek: "All", label, capacity, sortOrder: index }
      });

      await prisma.slotConfiguration.upsert({
        where: { testId_locationId_dayOfWeek_label: { testId: test.id, locationId: delhi.id, dayOfWeek: "All", label } },
        update: { capacity: capacity + 2, sortOrder: index },
        create: { testId: test.id, locationId: delhi.id, dayOfWeek: "All", label, capacity: capacity + 2, sortOrder: index }
      });
    }
  }
}

main().finally(() => prisma.$disconnect());
