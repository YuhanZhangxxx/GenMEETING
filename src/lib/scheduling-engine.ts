import { addDays, addMinutes, setHours, setMinutes, startOfDay, isAfter, isBefore, getDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { ScoredSlot, UserPreferences } from "@/types";

interface BusyBlock {
  start: Date;
  end: Date;
}

function parseHHMM(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(":").map(Number);
  return { hours: h, minutes: m };
}

function applyHHMM(date: Date, hhmm: string): Date {
  const { hours, minutes } = parseHHMM(hhmm);
  return setMinutes(setHours(startOfDay(date), hours), minutes);
}

function overlaps(slotStart: Date, slotEnd: Date, blockStart: Date, blockEnd: Date): boolean {
  return isBefore(slotStart, blockEnd) && isAfter(slotEnd, blockStart);
}

/**
 * Given existing events and user preferences, returns up to `topN` scored time slots
 * suitable for a new meeting of `durationMinutes` length.
 */
export function findBestSlots(
  busyBlocks: BusyBlock[],
  prefs: UserPreferences,
  durationMinutes: number,
  daysAhead = 14,
  topN = 3
): ScoredSlot[] {
  const tz = prefs.timezone || "UTC";
  const nowUtc = new Date();
  const now = toZonedTime(nowUtc, tz);
  const buffer = prefs.bufferMinutes;

  // Expand busy blocks with buffer time
  const expandedBusy: BusyBlock[] = busyBlocks.map((b) => ({
    start: addMinutes(b.start, -buffer),
    end: addMinutes(b.end, buffer),
  }));

  const candidates: ScoredSlot[] = [];

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const dayZoned = addDays(startOfDay(now), dayOffset);
    const dayOfWeek = getDay(dayZoned); // 0=Sun

    // Skip non-work days
    if (!prefs.workDays.includes(dayOfWeek)) continue;

    const workStart = applyHHMM(dayZoned, prefs.workStart);
    const workEnd = applyHHMM(dayZoned, prefs.workEnd);

    // Generate candidate slots every 30 minutes throughout the workday
    let cursor = workStart;

    while (!isAfter(addMinutes(cursor, durationMinutes), workEnd)) {
      const slotStart = cursor;
      const slotEnd = addMinutes(cursor, durationMinutes);

      // Skip slots in the past
      if (!isAfter(slotEnd, now)) {
        cursor = addMinutes(cursor, 30);
        continue;
      }

      // Check blackout times
      const blockedByBlackout = prefs.blackoutTimes.some((bo) => {
        if (bo.day !== -1 && bo.day !== dayOfWeek) return false;
        const boStart = applyHHMM(dayZoned, bo.start);
        const boEnd = applyHHMM(dayZoned, bo.end);
        return overlaps(slotStart, slotEnd, boStart, boEnd);
      });

      if (blockedByBlackout) {
        cursor = addMinutes(cursor, 30);
        continue;
      }

      // Check busy blocks
      const isBusy = expandedBusy.some((b) =>
        overlaps(slotStart, slotEnd, b.start, b.end)
      );

      if (!isBusy) {
        const score = scoreSlot(slotStart, slotEnd, expandedBusy, prefs, dayZoned);
        candidates.push(score);
      }

      cursor = addMinutes(cursor, 30);
    }
  }

  // Sort by score descending, deduplicate (keep best per hour), return top N
  candidates.sort((a, b) => b.score - a.score);

  const deduped: ScoredSlot[] = [];
  const usedHours = new Set<string>();

  for (const slot of candidates) {
    const key = `${slot.start.toISOString().slice(0, 13)}`; // hour key
    if (!usedHours.has(key)) {
      usedHours.add(key);
      deduped.push(slot);
    }
    if (deduped.length >= topN) break;
  }

  return deduped;
}

function scoreSlot(
  start: Date,
  end: Date,
  busyBlocks: BusyBlock[],
  prefs: UserPreferences,
  dayBase: Date
): ScoredSlot {
  let score = 50;
  const reasons: string[] = [];

  const startHour = start.getHours() + start.getMinutes() / 60;
  const workStartHour = parseHHMM(prefs.workStart).hours;
  const workEndHour = parseHHMM(prefs.workEnd).hours;
  const midday = (workStartHour + workEndHour) / 2;

  // Prefer afternoon slots (just past midday)
  if (startHour >= midday && startHour < midday + 2) {
    score += 20;
    reasons.push("Preferred afternoon window");
  }

  // Penalise very early or very late slots
  if (startHour < workStartHour + 1) {
    score -= 10;
    reasons.push("Early morning — less preferred");
  }
  if (startHour > workEndHour - 1.5) {
    score -= 15;
    reasons.push("End of day — less preferred");
  }

  // Bonus: light day (fewer than 2 existing meetings on this day)
  const dayStart = startOfDay(dayBase);
  const dayEnd = addDays(dayStart, 1);
  const meetingsToday = busyBlocks.filter(
    (b) => isAfter(b.start, dayStart) && isBefore(b.end, dayEnd)
  ).length;

  if (meetingsToday === 0) {
    score += 15;
    reasons.push("Light day — no other meetings");
  } else if (meetingsToday === 1) {
    score += 8;
    reasons.push("Only one other meeting today");
  } else if (meetingsToday >= 4) {
    score -= 20;
    reasons.push("Heavy meeting day");
  }

  // Bonus: good buffer from the nearest meeting
  const distanceFromNearest = busyBlocks.reduce((min, b) => {
    const before = (start.getTime() - b.end.getTime()) / 60000;
    const after = (b.start.getTime() - end.getTime()) / 60000;
    const gap = Math.max(before, after, 0);
    return Math.min(min, gap === 0 ? Infinity : gap);
  }, Infinity);

  if (distanceFromNearest > prefs.bufferMinutes * 2) {
    score += 10;
    reasons.push("Well-spaced from other meetings");
  }

  // Tie-break: prefer earlier in the day
  score -= startHour * 0.5;

  if (reasons.length === 0) reasons.push("Available slot");

  return { start, end, score: Math.round(score), reasons };
}
