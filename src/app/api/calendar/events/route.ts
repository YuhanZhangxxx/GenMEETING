import { NextRequest, NextResponse } from "next/server";
import { getAnySession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { fetchGoogleEvents } from "@/lib/google-calendar";
import { fetchOutlookEvents } from "@/lib/microsoft-calendar";

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const session = await getAnySession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const userEmail = session.user.email ?? "";

  // Check cache freshness
  const latestCached = await prisma.calendarEventCache.findFirst({
    where: { userId },
    orderBy: { fetchedAt: "desc" },
  });

  if (latestCached && Date.now() - latestCached.fetchedAt.getTime() < CACHE_TTL_MS) {
    const cached = await prisma.calendarEventCache.findMany({
      where: { userId, startTime: { gte: new Date() } },
      orderBy: { startTime: "asc" },
    });
    return NextResponse.json({ events: cached.map((e) => withPermissions(e, userEmail)), fromCache: true });
  }

  // Detect which providers this user has connected
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { provider: true },
  });
  const hasGoogle = accounts.some((a) => a.provider === "google");
  const hasMicrosoft = accounts.some((a) => a.provider === "microsoft");

  const errors: string[] = [];

  // --- Sync Google ---
  if (hasGoogle) {
    try {
      const items = await fetchGoogleEvents(userId, 14);
      for (const item of items) {
        if (!item.id) continue;
        const startDateTime = item.start?.dateTime ?? item.start?.date;
        const endDateTime = item.end?.dateTime ?? item.end?.date;
        if (!startDateTime || !endDateTime) continue;

        const allDay = !item.start?.dateTime;
        const organizerEmail = item.organizer?.email ?? "";
        const isOrganizer = item.organizer?.self === true;
        const attendees = (item.attendees ?? []).map((a) => ({
          email: a.email ?? "",
          responseStatus: a.responseStatus ?? "needsAction",
          self: a.self ?? false,
        }));
        const myAttendee = attendees.find((a) => a.self);
        const meetingLink =
          item.hangoutLink ??
          item.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
          null;

        await prisma.calendarEventCache.upsert({
          where: { userId_googleEventId: { userId, googleEventId: item.id } },
          create: {
            userId, googleEventId: item.id, source: "google",
            title: item.summary ?? "(No title)",
            startTime: new Date(startDateTime), endTime: new Date(endDateTime),
            allDay, isEditable: isOrganizer, organizerEmail,
            attendees: JSON.stringify(attendees),
            myResponseStatus: myAttendee?.responseStatus ?? null,
            meetingLink, fetchedAt: new Date(),
          },
          update: {
            title: item.summary ?? "(No title)",
            startTime: new Date(startDateTime), endTime: new Date(endDateTime),
            allDay, isEditable: isOrganizer, organizerEmail,
            attendees: JSON.stringify(attendees),
            myResponseStatus: myAttendee?.responseStatus ?? null,
            meetingLink, fetchedAt: new Date(),
          },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sync failed";
      const isAuthErr =
        msg.includes("insufficientPermissions") ||
        msg.includes("Invalid Credentials") ||
        msg.includes("No Google account") ||
        msg.includes("No access token");
      if (isAuthErr) {
        errors.push("calendar_access_denied:google");
      } else {
        errors.push(`google:${msg}`);
      }
    }
  }

  // --- Sync Microsoft ---
  if (hasMicrosoft) {
    try {
      const items = await fetchOutlookEvents(userId, 14);
      for (const item of items) {
        if (!item.id) continue;
        // Outlook dateTime is in the event's timeZone — treat as UTC for simplicity
        const startTime = new Date(item.start.dateTime + (item.start.timeZone === "UTC" ? "Z" : ""));
        const endTime = new Date(item.end.dateTime + (item.end.timeZone === "UTC" ? "Z" : ""));

        const organizerEmail = item.organizer?.emailAddress?.address ?? "";
        const attendees = (item.attendees ?? []).map((a) => ({
          email: a.emailAddress?.address ?? "",
          responseStatus: mapOutlookResponse(a.status?.response),
          self: a.emailAddress?.address?.toLowerCase() === userEmail.toLowerCase(),
        }));
        const myAttendee = attendees.find((a) => a.self);
        const meetingLink = item.onlineMeeting?.joinUrl ?? null;

        await prisma.calendarEventCache.upsert({
          where: { userId_googleEventId: { userId, googleEventId: item.id } },
          create: {
            userId, googleEventId: item.id, source: "outlook",
            title: item.subject ?? "(No title)",
            startTime, endTime,
            allDay: false, isEditable: item.isOrganizer,
            organizerEmail, attendees: JSON.stringify(attendees),
            myResponseStatus: myAttendee?.responseStatus ?? null,
            meetingLink, fetchedAt: new Date(),
          },
          update: {
            title: item.subject ?? "(No title)",
            startTime, endTime,
            isEditable: item.isOrganizer, organizerEmail,
            attendees: JSON.stringify(attendees),
            myResponseStatus: myAttendee?.responseStatus ?? null,
            meetingLink, fetchedAt: new Date(),
          },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Outlook sync failed";
      errors.push(`microsoft:${msg}`);
    }
  }

  // If the only error is Google auth, signal the UI
  if (errors.length > 0 && errors.every((e) => e === "calendar_access_denied:google")) {
    return NextResponse.json({ error: "calendar_access_denied" }, { status: 403 });
  }

  const events = await prisma.calendarEventCache.findMany({
    where: { userId, startTime: { gte: new Date() } },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({
    events: events.map((e) => withPermissions(e, userEmail)),
    fromCache: false,
    syncErrors: errors.length > 0 ? errors : undefined,
  });
}

function mapOutlookResponse(r?: string): string {
  switch (r) {
    case "accepted": return "accepted";
    case "declined": return "declined";
    case "tentativelyAccepted": return "tentative";
    default: return "needsAction";
  }
}

function withPermissions(
  event: {
    id: string; googleEventId: string; source: string;
    title: string; startTime: Date; endTime: Date; allDay: boolean;
    isEditable: boolean; organizerEmail: string | null;
    attendees: string; myResponseStatus: string | null; meetingLink: string | null;
  },
  userEmail: string
) {
  const isOrganizer = event.isEditable;
  return {
    ...event,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime.toISOString(),
    isOrganizer,
    canEdit: isOrganizer,
    canCancel: isOrganizer,
    canRespond: !isOrganizer,
    canRequestChange: !isOrganizer,
    attendees: JSON.parse(event.attendees),
    userEmail,
  };
}
