import { NextRequest, NextResponse } from "next/server";
import { getAnySession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { updateGoogleEventTime } from "@/lib/google-calendar";
import { updateOutlookEventTime } from "@/lib/microsoft-calendar";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAnySession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const googleEventId = params.id;
  const { startTime, endTime } = await req.json();

  if (!startTime || !endTime) {
    return NextResponse.json({ error: "startTime and endTime required" }, { status: 400 });
  }

  const cached = await prisma.calendarEventCache.findFirst({
    where: { userId, googleEventId },
  });

  if (!cached) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!cached.isEditable) {
    return NextResponse.json({ error: "Not authorized to edit this event" }, { status: 403 });
  }

  try {
    if (cached.source === "outlook") {
      await updateOutlookEventTime(userId, googleEventId, startTime, endTime);
    } else {
      await updateGoogleEventTime(userId, googleEventId, startTime, endTime);
    }

    await prisma.rescheduleHistory.create({
      data: {
        userId,
        googleEventId,
        action: "updated",
        originalStart: cached.startTime,
        newStart: new Date(startTime),
        newEnd: new Date(endTime),
        reason: "Rescheduled by organizer",
      },
    });

    await prisma.calendarEventCache.deleteMany({ where: { userId } });

    const attendees: { email: string }[] = JSON.parse(cached.attendees || "[]");
    const attendeeUsers = await prisma.user.findMany({
      where: { email: { in: attendees.map((a) => a.email) } },
      select: { id: true },
    });
    if (attendeeUsers.length > 0) {
      await prisma.notification.createMany({
        data: attendeeUsers.map((u) => ({
          userId: u.id,
          type: "meeting_updated",
          title: `Meeting rescheduled: ${cached.title}`,
          body: `Moved to ${new Date(startTime).toLocaleString()}`,
          relatedId: googleEventId,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reschedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
