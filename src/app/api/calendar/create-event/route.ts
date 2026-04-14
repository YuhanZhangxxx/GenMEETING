import { NextRequest, NextResponse } from "next/server";
import { getAnySession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { createGoogleEvent } from "@/lib/google-calendar";
import { createOutlookEvent } from "@/lib/microsoft-calendar";
import type { CreateEventPayload } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getAnySession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body: CreateEventPayload & { provider?: "google" | "outlook" } = await req.json();
  const { title, startTime, endTime, description, attendees, addMeetLink, provider } = body;

  if (!title || !startTime || !endTime) {
    return NextResponse.json({ error: "title, startTime and endTime are required" }, { status: 400 });
  }

  // Detect which providers are connected if not specified
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true },
  });
  const hasGoogle = accounts.some((a) => a.provider === "google");
  const hasMicrosoft = accounts.some((a) => a.provider === "microsoft");

  // Default: prefer Google; fall back to Outlook
  const useProvider = provider ?? (hasGoogle ? "google" : hasMicrosoft ? "outlook" : null);

  if (!useProvider) {
    return NextResponse.json({ error: "No calendar account connected" }, { status: 400 });
  }

  try {
    let eventId: string | null = null;
    let meetLink: string | null = null;
    let htmlLink: string | null = null;

    if (useProvider === "google") {
      const event = await createGoogleEvent(userId, { title, startTime, endTime, description, attendees, addMeetLink });
      eventId = event.id ?? null;
      meetLink = event.hangoutLink ?? null;
      htmlLink = event.htmlLink ?? null;
    } else {
      const event = await createOutlookEvent(userId, { title, startTime, endTime, description, attendees, addMeetLink });
      eventId = event?.id ?? null;
      meetLink = event?.onlineMeeting?.joinUrl ?? null;
    }

    await prisma.calendarEventCache.deleteMany({ where: { userId } });
    await prisma.rescheduleHistory.create({
      data: {
        userId, googleEventId: eventId,
        action: "created",
        newStart: new Date(startTime), newEnd: new Date(endTime),
        reason: `Created via ${useProvider}`,
      },
    });

    return NextResponse.json({ eventId, htmlLink, meetLink, provider: useProvider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
