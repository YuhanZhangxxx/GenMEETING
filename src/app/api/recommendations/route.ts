import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findBestSlots } from "@/lib/scheduling-engine";
import type { UserPreferences, BlackoutTime } from "@/types";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const duration = parseInt(searchParams.get("duration") ?? "60", 10);

  // Load preferences
  const prefRow = await prisma.meetingPreference.findUnique({ where: { userId } });
  const prefs: UserPreferences = prefRow
    ? {
        workDays: prefRow.workDays.split(",").map(Number),
        workStart: prefRow.workStart,
        workEnd: prefRow.workEnd,
        bufferMinutes: prefRow.bufferMinutes,
        blackoutTimes: JSON.parse(prefRow.blackoutTimes) as BlackoutTime[],
        preferredSlotMinutes: prefRow.preferredSlotMinutes,
        timezone: prefRow.timezone,
        autoReschedule: prefRow.autoReschedule,
      }
    : {
        workDays: [1, 2, 3, 4, 5],
        workStart: "09:00",
        workEnd: "18:00",
        bufferMinutes: 15,
        blackoutTimes: [],
        preferredSlotMinutes: 60,
        timezone: "UTC",
        autoReschedule: false,
      };

  // Load cached events as busy blocks
  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const events = await prisma.calendarEventCache.findMany({
    where: {
      userId,
      startTime: { gte: now },
      endTime: { lte: twoWeeks },
    },
    select: { startTime: true, endTime: true },
  });

  const busyBlocks = events.map((e) => ({
    start: e.startTime,
    end: e.endTime,
  }));

  const slots = findBestSlots(busyBlocks, prefs, duration, 14, 3);

  return NextResponse.json({
    slots: slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      score: s.score,
      reasons: s.reasons,
    })),
  });
}
