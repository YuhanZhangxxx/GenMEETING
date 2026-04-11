import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCalendarClient } from "@/lib/google-calendar";
import { respondToOutlookEvent } from "@/lib/microsoft-calendar";

type ResponseStatus = "accepted" | "declined" | "tentative";

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
  const googleEventId = params.id;
  const { response }: { response: ResponseStatus } = await req.json();

  const validResponses: ResponseStatus[] = ["accepted", "declined", "tentative"];
  if (!validResponses.includes(response)) {
    return NextResponse.json({ error: "Invalid response value" }, { status: 400 });
  }

  const cached = await prisma.calendarEventCache.findFirst({
    where: { userId, googleEventId },
  });

  if (!cached) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  try {
    if (cached.source === "outlook") {
      const outlookResponse =
        response === "accepted" ? "accept"
        : response === "declined" ? "decline"
        : "tentativelyAccept";
      await respondToOutlookEvent(userId, googleEventId, outlookResponse);

      await prisma.calendarEventCache.updateMany({
        where: { userId, googleEventId },
        data: { myResponseStatus: response },
      });
    } else {
      const calendar = await getCalendarClient(userId);
      const event = await calendar.events.get({
        calendarId: "primary",
        eventId: googleEventId,
      });

      const updatedAttendees = (event.data.attendees ?? []).map((a) => {
        if (a.self || a.email === userEmail) {
          return { ...a, responseStatus: response };
        }
        return a;
      });

      await calendar.events.patch({
        calendarId: "primary",
        eventId: googleEventId,
        requestBody: { attendees: updatedAttendees },
      });

      await prisma.calendarEventCache.updateMany({
        where: { userId, googleEventId },
        data: {
          myResponseStatus: response,
          attendees: JSON.stringify(
            updatedAttendees.map((a) => ({
              email: a.email,
              responseStatus: a.responseStatus,
              self: a.self ?? false,
            }))
          ),
        },
      });
    }

    return NextResponse.json({ success: true, response });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to respond";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
