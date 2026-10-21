import type { Prisma } from "@prisma/client";
import { dayNameOf, dayRange, effectiveStartTime, isSlotPast, toDateStr } from "./time.js";

export { dayRange } from "./time.js";

type Db = Prisma.TransactionClient;

export class SlotError extends Error {
  status = 400;
}

/** Returns the active date block for this (test, location, date), or null if not blocked. */
async function getDateBlock(db: Db, testId: string, locationId: string, date: string | Date) {
  const { start } = dayRange(date);
  // Check center-specific block first, then all-center block (locationId=null)
  return db.testDateBlock.findFirst({
    where: {
      testId,
      date: start,
      OR: [
        { locationId },
        { locationId: null }
      ]
    },
    select: { id: true, reason: true, locationId: true }
  });
}

/** Returns the effective working days for a (test, location) pair.
 *  Per-center schedule (TestLocationSchedule) takes priority over global TestType.workDays. */
async function getEffectiveWorkDays(db: Db, testId: string, locationId: string): Promise<string[] | null> {
  const centerSchedule = await db.testLocationSchedule.findUnique({
    where: { testId_locationId: { testId, locationId } }
  });
  if (centerSchedule && centerSchedule.workDays.length > 0) {
    return centerSchedule.workDays;
  }
  const test = await db.testType.findUnique({ where: { id: testId }, select: { workDays: true } });
  return test?.workDays ?? null;
}

function isWorkDay(workDays: string[] | null, dayName: string) {
  return !workDays || workDays.length === 0 || workDays.includes(dayName);
}

/**
 * Finds which slot set applies for a test/center/day. Most specific wins:
 * center + weekday, center + "All", global + weekday, global + "All".
 */
async function effectiveSlotScope(db: Db, testId: string, locationId: string | null | undefined, dayName: string) {
  const candidates: Prisma.SlotConfigurationWhereInput[] = [
    ...(locationId ? [{ testId, locationId, dayOfWeek: dayName }, { testId, locationId, dayOfWeek: "All" }] : []),
    { testId, locationId: null, dayOfWeek: dayName },
    { testId, locationId: null, dayOfWeek: "All" }
  ];
  for (const where of candidates) {
    if ((await db.slotConfiguration.count({ where })) > 0) return where;
  }
  return candidates[candidates.length - 1];
}

export async function slotAvailability(db: Db, testId: string, locationId: string, date: string | Date, ignoreAppointmentId?: string) {
  const dayName = dayNameOf(date);
  if (!isWorkDay(await getEffectiveWorkDays(db, testId, locationId), dayName)) {
    return []; // day blocked at this center — return no slots
  }

  // Check if this test is blocked for this specific date
  const block = await getDateBlock(db, testId, locationId, date);
  if (block) {
    return []; // date is blocked — return no slots (frontend sees it as unavailable)
  }
  const { start, end } = dayRange(date);
  const scope = await effectiveSlotScope(db, testId, locationId, dayName);
  const slots = await db.slotConfiguration.findMany({ where: { ...scope, active: true }, orderBy: { sortOrder: "asc" } });

  const bookings = await db.appointment.groupBy({
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
  const now = new Date();
  return slots.map((slot) => {
    const booked = used.get(slot.label) || 0;
    const left = Math.max(slot.capacity - booked, 0);
    return {
      id: slot.id,
      label: slot.label,
      startTime: effectiveStartTime(slot),
      capacity: slot.capacity,
      booked,
      left,
      full: left === 0,
      past: isSlotPast(date, slot, now)
    };
  });
}

export type SlotAvailability = Awaited<ReturnType<typeof slotAvailability>>[number];

/** Returned by upcomingAvailability when a date is admin-blocked. */
export type DateBlockInfo = { id: string; reason: string | null; locationId: string | null } | null;

export type DayAvailability = {
  date: string;
  dayName: string;
  isWorkDay: boolean;
  totalCapacity: number;
  totalBooked: number;
  totalLeft: number;
  isFull: boolean;
  blocked: boolean;        // true when an admin has blocked this date
  blockReason: string | null;
  slots: SlotAvailability[];
};

export async function upcomingAvailability(
  db: Db,
  testId: string,
  locationId: string,
  startDateStr: string,
  daysCount = 7
): Promise<DayAvailability[]> {
  const result: DayAvailability[] = [];
  const { start } = dayRange(startDateStr);
  const workDays = await getEffectiveWorkDays(db, testId, locationId);

  for (let i = 0; i < daysCount; i++) {
    const dateStr = toDateStr(new Date(start.getTime() + i * 86_400_000));
    const dayName = dayNameOf(dateStr);

    if (!isWorkDay(workDays, dayName)) {
      result.push({ date: dateStr, dayName, isWorkDay: false, totalCapacity: 0, totalBooked: 0, totalLeft: 0, isFull: false, blocked: false, blockReason: null, slots: [] });
      continue;
    }

    // Check admin date block before fetching slots
    const block = await getDateBlock(db, testId, locationId, dateStr);
    if (block) {
      result.push({ date: dateStr, dayName, isWorkDay: true, totalCapacity: 0, totalBooked: 0, totalLeft: 0, isFull: true, blocked: true, blockReason: block.reason ?? null, slots: [] });
      continue;
    }

    const slots = await slotAvailability(db, testId, locationId, dateStr);
    // Slots whose time has already passed today can't be booked, so they don't count as open capacity.
    const bookable = slots.filter((s) => !s.past);
    const totalCapacity = slots.reduce((acc, s) => acc + s.capacity, 0);
    const totalBooked = slots.reduce((acc, s) => acc + s.booked, 0);
    const totalLeft = bookable.reduce((acc, s) => acc + s.left, 0);

    result.push({
      date: dateStr,
      dayName,
      isWorkDay: true,
      totalCapacity,
      totalBooked,
      totalLeft,
      isFull: slots.length > 0 && totalLeft === 0,
      blocked: false,
      blockReason: null,
      slots
    });
  }

  return result;
}

/**
 * Validates that a booking can go into the given slot and locks it for the
 * rest of the transaction. Checks the per-center working days, that the slot
 * is configured and active, that its time hasn't passed (unless allowPast),
 * and that capacity is left.
 */
export async function assertSlotHasCapacity(
  tx: Db,
  testId: string,
  locationId: string,
  date: string | Date,
  slot: string,
  opts: { ignoreAppointmentId?: string; allowPast?: boolean } = {}
) {
  const dayName = dayNameOf(date);
  if (!isWorkDay(await getEffectiveWorkDays(tx, testId, locationId), dayName)) {
    const [test, location] = await Promise.all([
      tx.testType.findUnique({ where: { id: testId }, select: { name: true } }),
      tx.location.findUnique({ where: { id: locationId }, select: { name: true } })
    ]);
    throw new SlotError(`"${test?.name ?? "This test"}" is not available at ${location?.name ?? "this center"} on ${dayName}s.`);
  }

  // Check admin date block — hard stop, even for admins
  const block = await getDateBlock(tx, testId, locationId, date);
  if (block) {
    const test = await tx.testType.findUnique({ where: { id: testId }, select: { name: true } });
    const reason = block.reason ? ` Reason: ${block.reason}` : "";
    throw new SlotError(`"${test?.name ?? "This test"}" has been blocked for this date by an administrator.${reason}`);
  }

  // PostgreSQL advisory lock serializes competing bookings for the same date/test/slot/location.
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `${testId}:${locationId}:${toDateStr(date)}:${slot}`);

  const scope = await effectiveSlotScope(tx, testId, locationId, dayName);
  const config = await tx.slotConfiguration.findFirst({ where: { ...scope, label: slot } });
  if (!config || !config.active) throw new SlotError("Slot is not configured");

  if (!opts.allowPast && isSlotPast(date, config)) {
    throw new SlotError(`The ${slot} slot has already passed for today. Please choose a later slot or another date.`);
  }

  const { start, end } = dayRange(date);
  const booked = await tx.appointment.count({
    where: {
      testId,
      locationId: locationId || null,
      slot,
      appointmentDate: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      ...(opts.ignoreAppointmentId ? { id: { not: opts.ignoreAppointmentId } } : {})
    }
  });
  if (booked >= config.capacity) throw new SlotError("Slot is full");
}
