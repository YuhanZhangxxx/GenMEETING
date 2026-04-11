import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findBestSlots } from "@/lib/scheduling-engine";
import type { UserPreferences, BlackoutTime } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const googleEventId = params.id;
  const { reason, proposedSlots: manualSlots } = await req.json();

  const cached = await prisma.calendarEventCache.findFirst({
    where: { userId, googleEventId },
  });

  if (!cached) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Use provided slots or auto-generate from scheduling engine
  let proposedSlots = manualSlots;
  if (!proposedSlots || proposedSlots.length === 0) {
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

    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const events = await prisma.calendarEventCache.findMany({
      where: { userId, startTime: { gte: now }, endTime: { lte: twoWeeks } },
      select: { startTime: true, endTime: true },
    });

    const durationMs = cached.endTime.getTime() - cached.startTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    const busyBlocks = events.map((e) => ({ start: e.startTime, end: e.endTime }));
    const slots = findBestSlots(busyBlocks, prefs, durationMinutes, 14, 3);
    proposedSlots = slots.map((s) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      score: s.score,
      reasons: s.reasons,
    }));
  }

  const changeRequest = await prisma.changeRequest.create({
    data: {
      googleEventId,
      eventTitle: cached.title,
      requesterUserId: userId,
      requesterEmail: session.user.email ?? "",
      organizerEmail: cached.organizerEmail ?? "",
      proposedSlots: JSON.stringify(proposedSlots),
      reason: reason ?? null,
      status: "pending",
    },
  });

  // Notify organizer if they're in this system
  const organizerUser = await prisma.user.findFirst({
    where: { email: cached.organizerEmail ?? "" },
  });
  if (organizerUser) {
    await prisma.notification.create({
      data: {
        userId: organizerUser.id,
        type: "reschedule_request",
        title: `Reschedule request: ${cached.title}`,
        body: `${session.user.email} requested to reschedule this meeting`,
        relatedId: changeRequest.id,
      },
    });
  }

  return NextResponse.json({
    success: true,
    changeRequestId: changeRequest.id,
    proposedSlots,
  });
}
