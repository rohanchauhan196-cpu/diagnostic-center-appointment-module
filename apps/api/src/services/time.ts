/**
 * Calendar/time helpers pinned to the center's timezone.
 *
 * Appointment dates are stored as UTC midnight of the calendar day
 * (new Date("YYYY-MM-DD")), so day math is done in UTC and "today"/"now"
 * are resolved in APP_TIMEZONE — never the server's local timezone.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Today's calendar date in the app timezone, as YYYY-MM-DD. */
export function todayStr(now = new Date()): string {
  return nowParts(now).date;
}

/** Minutes since midnight right now in the app timezone. */
export function nowMinutes(now = new Date()): number {
  return nowParts(now).minutes;
}

/** Normalizes a date input ("YYYY-MM-DD", ISO string, or stored Date) to YYYY-MM-DD. */
export function toDateStr(date: string | Date): string {
  return (date instanceof Date ? date.toISOString() : String(date)).slice(0, 10);
}

/** [start, end) range covering one calendar day as stored in the database. */
export function dayRange(date: string | Date) {
  const [y, m, d] = toDateStr(date).split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 1));
  return { start, end };
}

export function dayNameOf(date: string | Date): string {
  return DAYS_OF_WEEK[dayRange(date).start.getUTCDay()];
}

/**
 * Extracts the start time from a slot label, e.g. "7:30 AM", "12:30 PM - 1:00 PM",
 * "10 am (Fasting)", "14:00". Returns "HH:mm" (24h) or null when no time is found.
 */
export function parseTimeFromLabel(label: string): string | null {
  for (const match of label.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\d)/gi)) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
    // A bare number with no minutes and no AM/PM (e.g. "Batch 2") is not a time.
    if (!match[2] && !meridiem) continue;
    if (minute > 59) continue;
    if (meridiem) {
      if (hour < 1 || hour > 12) continue;
      if (meridiem === "pm" && hour !== 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    } else if (hour > 23) {
      continue;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return null;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Explicit startTime wins; otherwise fall back to the time written in the label. */
export function effectiveStartTime(slot: { startTime?: string | null; label: string }): string | null {
  return slot.startTime || parseTimeFromLabel(slot.label);
}

/** Minutes after a slot's start time during which it can still be booked for today. */
const GRACE_MINUTES = Number(process.env.SLOT_BOOKING_GRACE_MINUTES || 0);

/** True when the slot is on today's date and its start time has already passed. */
export function isSlotPast(date: string | Date, slot: { startTime?: string | null; label: string }, now = new Date()): boolean {
  const start = effectiveStartTime(slot);
  if (!start) return false;
  const { date: today, minutes } = nowParts(now);
  const day = toDateStr(date);
  if (day < today) return true;
  if (day > today) return false;
  return minutes >= timeToMinutes(start) + GRACE_MINUTES;
}
