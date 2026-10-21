/**
 * Slot time helpers for the admin slot editor. Mirrors the API's
 * parseTimeFromLabel (apps/api/src/services/time.ts) so the editor can show
 * which time the server will use for a label.
 */

/** Extracts a start time ("HH:mm", 24h) from a label like "10:30 AM - Fasting". */
export function parseTimeFromLabel(label: string): string | null {
  for (const match of label.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\d)/gi)) {
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const meridiem = match[3]?.toLowerCase().replace(/\./g, "");
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

export function minutesToTime(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "14:30" -> "2:30 PM" */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Builds a slot label from a time and an optional suffix, e.g. "10:00 AM - Fasting". */
export function slotLabel(time: string, suffix?: string): string {
  const s = suffix?.trim();
  return s ? `${formatTime12h(time)} - ${s}` : formatTime12h(time);
}
