import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateGoogleEventTime } from "@/lib/google-calendar";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email ?? "";
  const changeRequestId = params.id;
  const { action, selectedSlot }: { action: "approved" | "rejected"; selectedSlot?: { start: string; end: string } } =
    await req.json();

  const cr = await prisma.changeRequest.findUnique({ where: { id: changeRequestId } });
  if (!cr) {
    return NextResponse.json({ error: "Change request not found" }, { status: 404 });
  }
  if (cr.organizerEmail !== userEmail) {
    return NextResponse.json({ error: "Only the organizer can respond" }, { status: 403 });
  }
  if (cr.status !== "pending") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 400 });
  }

  if (action === "approved") {
    if (!selectedSlot) {
      return NextResponse.json({ error: "selectedSlot required for approval" }, { status: 400 });
    }

    await updateGoogleEventTime(userId, cr.googleEventId, selectedSlot.start, selectedSlot.end);

    await prisma.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: "approved",
        selectedSlot: JSON.stringify(selectedSlot),
      },
    });

    await prisma.calendarEventCache.deleteMany({ where: { userId } });

    // Notify requester
    const requester = await prisma.user.findUnique({ where: { id: cr.requesterUserId } });
    if (requester) {
      await prisma.notification.create({
        data: {
          userId: requester.id,
          type: "meeting_updated",
          title: `Reschedule approved: ${cr.eventTitle}`,
          body: `Meeting moved to ${new Date(selectedSlot.start).toLocaleString()}`,
          relatedId: cr.googleEventId,
        },
      });
    }
  } else {
    await prisma.changeRequest.update({
      where: { id: changeRequestId },
      data: { status: "rejected" },
    });

    const requester = await prisma.user.findUnique({ where: { id: cr.requesterUserId } });
    if (requester) {
      await prisma.notification.create({
        data: {
          userId: requester.id,
          type: "meeting_updated",
          title: `Reschedule declined: ${cr.eventTitle}`,
          body: `The organizer declined your reschedule request`,
          relatedId: cr.googleEventId,
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
