import { NextRequest, NextResponse } from "next/server";
import { getAnySession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { format } from "date-fns";

export interface AISuggestion {
  type: "reschedule" | "rsvp" | "cancel" | "conflict" | "info";
  eventId?: string;
  eventTitle?: string;
  eventStartTime?: string; // ISO — injected server-side from DB, not from AI
  message: string;
  action?: {
    label: string;
    newStartTime?: string;
    newEndTime?: string;
    response?: "accepted" | "declined" | "tentative";
  };
}

export async function GET(req: NextRequest) {
  const session = await getAnySession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (process.env.NODE_ENV !== "production") {
    console.log("[ai-advisor] key prefix:", apiKey ? apiKey.slice(0, 10) + "..." : "MISSING");
  }

  if (!apiKey || apiKey === "sk-...") {
    return NextResponse.json(
      { error: "OpenAI API key not configured — set OPENAI_API_KEY in .env.local and restart the server" },
      { status: 503 }
    );
  }

  const openai = new OpenAI({ apiKey });

  const userId = session.user.id;
  const now = new Date();
  const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const events = await prisma.calendarEventCache.findMany({
    where: {
      userId,
      startTime: { gte: now, lte: twoWeeksLater },
    },
    orderBy: { startTime: "asc" },
    take: 20,
  });

  if (events.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const eventList = events.map((e) => {
    const attendees = JSON.parse(e.attendees || "[]") as { email: string }[];
    return {
      eventId: e.googleEventId,
      title: e.title,
      start: format(e.startTime, "yyyy-MM-dd HH:mm"),
      end: format(e.endTime, "yyyy-MM-dd HH:mm"),
      startISO: e.startTime.toISOString(),
      source: e.source,
      myStatus: e.myResponseStatus || "needsAction",
      isOrganizer: e.isEditable,
      attendeeCount: attendees.length,
    };
  });

  // Build a lookup map so we can attach accurate start times to suggestions
  const eventMap = new Map(eventList.map((e) => [e.eventId, e]));

  const prompt = `You are a smart meeting assistant. Today is ${format(now, "EEEE, MMMM d, yyyy HH:mm")}.

Analyze these upcoming meetings and return 3-5 specific, actionable suggestions.

Meetings:
${eventList
  .map(
    (e, i) =>
      `${i + 1}. id="${e.eventId}" | "${e.title}" | ${e.start}–${e.end} | source:${e.source} | myStatus:${e.myStatus} | ${e.isOrganizer ? "I am organizer" : "I am attendee"} | ${e.attendeeCount} attendees`
  )
  .join("\n")}

Return a JSON object: {"suggestions": [...]} where each suggestion has:
- "type": one of "reschedule", "rsvp", "cancel", "conflict", "info"
- "eventId": the exact id string from above (only if related to a specific meeting)
- "eventTitle": the meeting title (only if related to a specific meeting)
- "message": a specific, helpful suggestion in 1-2 sentences
- "action": (optional) if you can suggest a concrete one-click action:
  - "label": short button text (e.g. "Accept", "Decline", "Move to 3pm")
  - For rsvp type: "response" must be "accepted", "declined", or "tentative"
  - For reschedule type: "newStartTime" and "newEndTime" in ISO 8601 format (pick a nearby timeslot that avoids conflicts)

STRICT RULES — only suggest things you can observe from the data above:
- "rsvp": ONLY if myStatus is "needsAction" and I am an attendee (not organizer)
- "conflict": ONLY if two meetings overlap in time
- "reschedule": ONLY if meetings are back-to-back (≤5 min gap) or outside 9am–7pm
- "cancel": ONLY if I am organizer AND attendeeCount is 0
- "info": general scheduling observations (max 1)
- DO NOT suggest adding attendees, writing agendas, or any action you cannot perform via reschedule/rsvp/cancel
- Skip meetings that look fine`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1200,
    });

    const content = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(content) as { suggestions?: AISuggestion[] };
    const suggestions: AISuggestion[] = (parsed.suggestions ?? []).map((s) => {
      // Attach accurate start time from DB rather than trusting AI output
      if (s.eventId) {
        const ev = eventMap.get(s.eventId);
        if (ev) s.eventStartTime = ev.startISO;
      }
      return s;
    });

    return NextResponse.json({ suggestions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI advisor error";
    if (process.env.NODE_ENV !== "production") {
      console.error("[ai-advisor] OpenAI error:", message);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
