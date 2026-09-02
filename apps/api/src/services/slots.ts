import { PrismaClient } from "@prisma/client";

type SlotTx = Pick<PrismaClient, "$executeRawUnsafe" | "slotConfiguration" | "appointment" | "testType">;

export function dayRange(date: string | Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function getLocalDayName(dateInput: string | Date): string {
  const dateStr = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  const datePart = dateStr.slice(0, 10); // YYYY-MM-DD
  const [year, month, day] = datePart.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return DAYS_OF_WEEK[localDate.getDay()];
}

/** Returns the effective working days for a (test, location) pair.
 *  Per-center schedule (TestLocationSchedule) takes priority over global TestType.workDays. */
async function getEffectiveWorkDays(prisma: PrismaClient, testId: string, locationId: string): Promise<string[] | null> {
  // 1. Check per-center schedule
  try {
    const centerSchedule = await (prisma as any).testLocationSchedule.findUnique({
      where: { testId_locationId: { testId, locationId } }
    });
    if (centerSchedule && centerSchedule.workDays.length > 0) {
      return centerSchedule.workDays as string[];
    }
  } catch (_) {
    // Table not yet available — fall through
  }

  // 2. Fall back to global TestType.workDays
  const test = await prisma.testType.findUnique({
    where: { id: testId },
    select: { workDays: true }
  });
  return test?.workDays ?? null;
}

async function fetchEffectiveSlots(prisma: PrismaClient, testId: string, locationId: string | undefined | null, dayName: string) {
  if (locationId) {
    const countCenterDay = await prisma.slotConfiguration.count({
      where: { testId, locationId, dayOfWeek: dayName }
    });
    if (countCenterDay > 0) {
      return prisma.slotConfiguration.findMany({
        where: { testId, locationId, dayOfWeek: dayName, active: true },
        orderBy: { sortOrder: "asc" }
      });
    }

    const countCenterAll = await prisma.slotConfiguration.count({
      where: { testId, locationId, dayOfWeek: "All" }
    });
    if (countCenterAll > 0) {
      return prisma.slotConfiguration.findMany({
        where: { testId, locationId, dayOfWeek: "All", active: true },
        orderBy: { sortOrder: "asc" }
      });
    }
  }

  const countGlobalDay = await prisma.slotConfiguration.count({
    where: { testId, locationId: null, dayOfWeek: dayName }
  });
  if (countGlobalDay > 0) {
    return prisma.slotConfiguration.findMany({
      where: { testId, locationId: null, dayOfWeek: dayName, active: true },
      orderBy: { sortOrder: "asc" }
    });
  }

  return prisma.slotConfiguration.findMany({
    where: { testId, locationId: null, dayOfWeek: "All", active: true },
    orderBy: { sortOrder: "asc" }
  });
}

export async function slotAvailability(prisma: PrismaClient, testId: string, locationId: string, date: string | Date, ignoreAppointmentId?: string) {
  // Check effective working days (per-center first, then global)
  const workDays = await getEffectiveWorkDays(prisma, testId, locationId);
  if (workDays && workDays.length > 0) {
    const dayName = getLocalDayName(date);
    if (!workDays.includes(dayName)) {
      return []; // day blocked at this center — return no slots
    }
  }

  const { start, end } = dayRange(date);
  const dayName = getLocalDayName(date);
  const slots = await fetchEffectiveSlots(prisma, testId, locationId, dayName);

  const bookings = await prisma.appointment.groupBy({
    by: ["slot"],
    where: {
      testId,
      locationId: locationId || null,
      appointmentDate: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {})
    },
    _count: { slot: true }
  });
  const used = new Map(bookings.map((b) => [b.slot, b._count.slot]));
  return slots.map((slot) => {
    const booked = used.get(slot.label) || 0;
    const left = Math.max(slot.capacity - booked, 0);
    return { id: slot.id, label: slot.label, capacity: slot.capacity, booked, left, full: left === 0 };
  });
}

async function fetchEffectiveSlotConfig(tx: SlotTx, testId: string, locationId: string | undefined | null, dayName: string, slotLabel: string) {
  if (locationId) {
    const countCenterDay = await tx.slotConfiguration.count({
      where: { testId, locationId, dayOfWeek: dayName }
    });
    if (countCenterDay > 0) {
      return tx.slotConfiguration.findFirst({
        where: { testId, locationId, dayOfWeek: dayName, label: slotLabel }
      });
    }

    const countCenterAll = await tx.slotConfiguration.count({
      where: { testId, locationId, dayOfWeek: "All" }
    });
    if (countCenterAll > 0) {
      return tx.slotConfiguration.findFirst({
        where: { testId, locationId, dayOfWeek: "All", label: slotLabel }
      });
    }
  }

  const countGlobalDay = await tx.slotConfiguration.count({
    where: { testId, locationId: null, dayOfWeek: dayName }
  });
  if (countGlobalDay > 0) {
    return tx.slotConfiguration.findFirst({
      where: { testId, locationId: null, dayOfWeek: dayName, label: slotLabel }
    });
  }

  return tx.slotConfiguration.findFirst({
    where: { testId, locationId: null, dayOfWeek: "All", label: slotLabel }
  });
}

export async function assertSlotHasCapacity(tx: SlotTx, testId: string, locationId: string, date: string | Date, slot: string, ignoreAppointmentId?: string) {
  // Check global workDays (per-center check is done earlier in the request flow via validateWorkDayForCenter)
  const test = await tx.testType.findUnique({
    where: { id: testId },
    select: { workDays: true }
  });
  if (test && test.workDays && test.workDays.length > 0) {
    const dayName = getLocalDayName(date);
    if (!test.workDays.includes(dayName)) {
      throw new Error(`This test is not available on ${dayName}s.`);
    }
  }

  // PostgreSQL advisory lock serializes competing bookings for the same date/test/slot/location.
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `${testId}:${locationId}:${new Date(date).toISOString().slice(0, 10)}:${slot}`);
  const { start, end } = dayRange(date);
  const dayName = getLocalDayName(date);
  const config = await fetchEffectiveSlotConfig(tx, testId, locationId, dayName, slot);

  if (!config || !config.active) throw new Error("Slot is not configured");
  const booked = await tx.appointment.count({
    where: {
      testId,
      locationId: locationId || null,
      slot,
      appointmentDate: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      ...(ignoreAppointmentId ? { id: { not: ignoreAppointmentId } } : {})
    }
  });
  if (booked >= config.capacity) throw new Error("Slot is full");
}

