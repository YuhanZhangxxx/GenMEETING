import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateGoogleEventTime } from "@/lib/google-calendar";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { googleEventId, startTime, endTime } = await req.json();

  if (!googleEventId || !startTime || !endTime) {
    return NextResponse.json(
      { error: "googleEventId, startTime and endTime are required" },
      { status: 400 }
    );
  }

  try {
    // Find the original event in cache for history
    const original = await prisma.calendarEventCache.findFirst({
      where: { userId, googleEventId },
    });

    const updated = await updateGoogleEventTime(userId, googleEventId, startTime, endTime);

    await prisma.rescheduleHistory.create({
      data: {
        userId,
        googleEventId,
        action: "updated",
        originalStart: original?.startTime ?? null,
        newStart: new Date(startTime),
        newEnd: new Date(endTime),
        reason: "Rescheduled via AI assistant",
      },
    });

    return NextResponse.json({ success: true, event: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
