"use client";

import { useEffect, useState, useCallback } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { signIn } from "next-auth/react";
import type { MeetingEvent } from "@/types";
import RescheduleModal from "@/components/RescheduleModal";
import CancelModal from "@/components/CancelModal";
import RequestChangeModal from "@/components/RequestChangeModal";
import MonthCalendarView from "@/components/MonthCalendarView";

function groupByDay(events: MeetingEvent[]): Record<string, MeetingEvent[]> {
  return events.reduce<Record<string, MeetingEvent[]>>((acc, e) => {
    const key = format(parseISO(e.startTime), "yyyy-MM-dd");
    (acc[key] ??= []).push(e);
    return acc;
  }, {});
}

const RSVP_LABEL: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
  needsAction: "Pending",
};

const RSVP_COLOR: Record<string, string> = {
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  tentative: "bg-yellow-100 text-yellow-700",
  needsAction: "bg-slate-100 text-slate-500",
};

interface Props {
  view?: "list" | "month";
  refreshKey?: number;
  onRefresh?: () => void;
}

export default function CalendarView({
  view = "list",
  refreshKey = 0,
  onRefresh,
}: Props) {
  const [events, setEvents] = useState<MeetingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarDenied, setCalendarDenied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState<MeetingEvent | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MeetingEvent | null>(null);
  const [requestChangeTarget, setRequestChangeTarget] = useState<MeetingEvent | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setCalendarDenied(false);
    fetch("/api/calendar/events")
      .then((r) => r.json())
      .then((data) => {
        if (data.error === "calendar_access_denied") {
          setCalendarDenied(true);
          return;
        }
        if (data.error) throw new Error(data.error);
        setEvents(data.events ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function handleSuccess() {
    setTimeout(() => {
      load();
      onRefresh?.();
    }, 800);
  }

  async function handleReauth() {
    setRevoking(true);
    await fetch("/api/auth/revoke-calendar", { method: "POST" });
    signIn("google", { callbackUrl: "/dashboard" });
  }

  const modals = (
    <>
      {rescheduleTarget && (
        <RescheduleModal
          event={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={handleSuccess}
        />
      )}
      {cancelTarget && (
        <CancelModal
          event={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSuccess={handleSuccess}
        />
      )}
      {requestChangeTarget && (
        <RequestChangeModal
          event={requestChangeTarget}
          onClose={() => setRequestChangeTarget(null)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  if (calendarDenied) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">⚠️</span>
          <div>
            <p className="font-semibold text-slate-800">Calendar access not granted</p>
            <p className="text-sm text-slate-600 mt-1">
              MeetAI needs permission to read your Google Calendar.
            </p>
          </div>
        </div>
        <button
          onClick={handleReauth}
          disabled={revoking}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-all"
        >
          {revoking ? "Redirecting..." : "Grant Calendar Access"}
        </button>
      </div>
    );
  }

  // ── Month view ──
  if (view === "month") {
    return (
      <>
        <MonthCalendarView
          events={events}
          onReschedule={setRescheduleTarget}
          onCancel={setCancelTarget}
          onRequestChange={setRequestChangeTarget}
          onRsvpSuccess={handleSuccess}
        />
        {modals}
      </>
    );
  }

  // ── List view ──
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No upcoming events in the next 14 days.
      </div>
    );
  }

  const grouped = groupByDay(events);
  const today = new Date();

  return (
    <>
      <div className="space-y-6">
        {Object.entries(grouped).map(([day, dayEvents]) => {
          const date = parseISO(day);
          const isToday = isSameDay(date, today);
          return (
            <div key={day}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`text-sm font-semibold ${isToday ? "text-blue-600" : "text-slate-500"}`}
                >
                  {isToday ? "Today" : format(date, "EEEE")}
                </span>
                <span className="text-sm text-slate-400">{format(date, "MMM d")}</span>
                {isToday && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    Today
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {dayEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onReschedule={() => setRescheduleTarget(event)}
                    onCancel={() => setCancelTarget(event)}
                    onRequestChange={() => setRequestChangeTarget(event)}
                    onRsvpSuccess={handleSuccess}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {modals}
    </>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "outlook") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-px rounded">
        <svg className="w-2.5 h-2.5" viewBox="0 0 21 21">
          <rect x="1" y="1" width="8.5" height="8.5" fill="#f25022" />
          <rect x="11.5" y="1" width="8.5" height="8.5" fill="#00a4ef" />
          <rect x="1" y="11.5" width="8.5" height="8.5" fill="#7fba00" />
          <rect x="11.5" y="11.5" width="8.5" height="8.5" fill="#ffb900" />
        </svg>
        Outlook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-px rounded">
      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
      Google
    </span>
  );
}

function EventCard({
  event,
  onReschedule,
  onCancel,
  onRequestChange,
  onRsvpSuccess,
}: {
  event: MeetingEvent;
  onReschedule: () => void;
  onCancel: () => void;
  onRequestChange: () => void;
  onRsvpSuccess: () => void;
}) {
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState(
    event.myResponseStatus ?? "needsAction"
  );

  async function handleRsvp(response: string) {
    setRsvpLoading(response);
    try {
      const res = await fetch(`/api/meetings/${event.googleEventId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (res.ok) {
        setCurrentResponse(response);
        onRsvpSuccess();
      }
    } finally {
      setRsvpLoading(null);
    }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div
          className={`w-1 self-stretch rounded-full flex-shrink-0 ${
            event.isOrganizer ? "bg-blue-500" : "bg-violet-400"
          }`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-slate-800 truncate text-sm">
              {event.title}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {event.isOrganizer ? (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                  Organizer
                </span>
              ) : (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    RSVP_COLOR[currentResponse] ?? RSVP_COLOR.needsAction
                  }`}
                >
                  {RSVP_LABEL[currentResponse] ?? "Pending"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-slate-500">
              {event.allDay
                ? "All day"
                : `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}
            </p>
            <SourceBadge source={event.source} />
          </div>

          {event.attendees.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {event.attendees
                .slice(0, 2)
                .map((a) => a.email)
                .join(", ")}
              {event.attendees.length > 2 && ` +${event.attendees.length - 2}`}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-2">
            {event.meetingLink && (
              <a
                href={event.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-green-700"
              >
                Join
              </a>
            )}
            {event.canEdit && (
              <button
                onClick={onReschedule}
                className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg font-medium hover:bg-blue-100"
              >
                Reschedule
              </button>
            )}
            {event.canCancel && (
              <button
                onClick={onCancel}
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg font-medium hover:bg-red-100"
              >
                Cancel
              </button>
            )}
            {event.canRespond && currentResponse !== "accepted" && (
              <button
                onClick={() => handleRsvp("accepted")}
                disabled={rsvpLoading !== null}
                className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-lg font-medium hover:bg-green-100 disabled:opacity-50"
              >
                {rsvpLoading === "accepted" ? "..." : "Accept"}
              </button>
            )}
            {event.canRespond && currentResponse !== "tentative" && (
              <button
                onClick={() => handleRsvp("tentative")}
                disabled={rsvpLoading !== null}
                className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-lg font-medium hover:bg-yellow-100 disabled:opacity-50"
              >
                {rsvpLoading === "tentative" ? "..." : "Maybe"}
              </button>
            )}
            {event.canRespond && currentResponse !== "declined" && (
              <button
                onClick={() => handleRsvp("declined")}
                disabled={rsvpLoading !== null}
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50"
              >
                {rsvpLoading === "declined" ? "..." : "Decline"}
              </button>
            )}
            {event.canRequestChange && (
              <button
                onClick={onRequestChange}
                className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-lg font-medium hover:bg-slate-100"
              >
                Request Change
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
