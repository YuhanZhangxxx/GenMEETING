import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCalendarClient } from "@/lib/google-calendar";
import { deleteOutlookEvent } from "@/lib/microsoft-calendar";

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
  const { notifyAttendees = true } = await req.json().catch(() => ({}));

  const cached = await prisma.calendarEventCache.findFirst({
    where: { userId, googleEventId },
  });

  if (!cached) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (!cached.isEditable) {
    return NextResponse.json({ error: "Not authorized to cancel this event" }, { status: 403 });
  }

  try {
    if (cached.source === "outlook") {
      await deleteOutlookEvent(userId, googleEventId);
    } else {
      const calendar = await getCalendarClient(userId);
      await calendar.events.delete({
        calendarId: "primary",
        eventId: googleEventId,
        sendUpdates: notifyAttendees ? "all" : "none",
      });
    }

    await prisma.rescheduleHistory.create({
      data: {
        userId,
        googleEventId,
        action: "cancelled",
        originalStart: cached.startTime,
        reason: "Cancelled by organizer",
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
          type: "meeting_cancelled",
          title: `Meeting cancelled: ${cached.title}`,
          body: `Originally on ${cached.startTime.toLocaleString()}`,
          relatedId: googleEventId,
        })),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to cancel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
