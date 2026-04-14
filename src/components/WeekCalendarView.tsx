"use client";

import { memo, useState, useMemo } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import type { MeetingEvent } from "@/types";

const RSVP_COLOR: Record<string, string> = {
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  tentative: "bg-yellow-100 text-yellow-700",
  needsAction: "bg-slate-100 text-slate-500",
};
const RSVP_LABEL: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
  needsAction: "Pending",
};

interface Props {
  events: MeetingEvent[];
  onReschedule: (event: MeetingEvent) => void;
  onCancel: (event: MeetingEvent) => void;
  onRequestChange: (event: MeetingEvent) => void;
  onRsvpSuccess: () => void;
}

export default function WeekCalendarView({
  events,
  onReschedule,
  onCancel,
  onRequestChange,
  onRsvpSuccess,
}: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) out.push(addDays(weekStart, i));
    return out;
  }, [weekStart]);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  function eventsOnDay(d: Date) {
    return events.filter((e) => isSameDay(parseISO(e.startTime), d));
  }

  const selectedDayEvents = eventsOnDay(selectedDay);

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none"
        >
          ‹
        </button>
        <button
          onClick={() => {
            setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
            setSelectedDay(new Date());
          }}
          className="text-sm font-semibold text-slate-700 hover:text-blue-600 transition-colors"
        >
          {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </button>
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none"
        >
          ›
        </button>
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {days.map((d) => {
          const dayEvts = eventsOnDay(d);
          const isSelected = isSameDay(d, selectedDay);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => setSelectedDay(d)}
              className={`flex flex-col items-center py-2.5 rounded-xl transition-all relative ${
                isSelected
                  ? "bg-blue-600 text-white shadow-sm"
                  : today
                  ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700"
              }`}
            >
              <span
                className={`text-[10px] font-semibold tracking-wide ${
                  isSelected
                    ? "text-blue-100"
                    : today
                    ? "text-blue-500"
                    : "text-slate-400"
                }`}
              >
                {format(d, "EEE").toUpperCase()}
              </span>
              <span
                className={`text-base font-bold mt-0.5 ${
                  isSelected ? "text-white" : ""
                }`}
              >
                {format(d, "d")}
              </span>
              {dayEvts.length > 0 && (
                <div
                  className={`mt-1 flex gap-0.5 ${isSelected ? "" : ""}`}
                >
                  {dayEvts.slice(0, 3).map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 h-1 rounded-full ${
                        isSelected
                          ? "bg-white"
                          : today
                          ? "bg-blue-500"
                          : "bg-slate-400"
                      }`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day events */}
      <div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl font-bold text-blue-600">
            {format(selectedDay, "d")}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {format(selectedDay, "EEEE")}
            </p>
            <p className="text-xs text-slate-400">
              {selectedDayEvents.length === 0
                ? "No meetings"
                : `${selectedDayEvents.length} meeting${selectedDayEvents.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {selectedDayEvents.length === 0 ? (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-400 italic">
              No meetings scheduled for this day
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayEvents.map((event) => (
              <DayEventCard
                key={event.id}
                event={event}
                onReschedule={() => onReschedule(event)}
                onCancel={() => onCancel(event)}
                onRequestChange={() => onRequestChange(event)}
                onRsvpSuccess={onRsvpSuccess}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DayEventCard = memo(function DayEventCard({
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
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState(
    event.myResponseStatus ?? "needsAction"
  );

  async function handleRsvp(response: string) {
    setRsvpLoading(response);
    setRsvpError(null);
    try {
      const res = await fetch(`/api/meetings/${event.googleEventId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      setCurrentResponse(response);
      onRsvpSuccess();
    } catch (e) {
      setRsvpError((e as Error).message);
    } finally {
      setRsvpLoading(null);
    }
  }

  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-2.5">
        <div
          className={`w-1 self-stretch rounded-full flex-shrink-0 ${
            event.isOrganizer ? "bg-blue-500" : "bg-violet-400"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className="font-medium text-slate-800 text-sm truncate">
              {event.title}
            </p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                event.isOrganizer
                  ? "bg-blue-100 text-blue-700"
                  : (RSVP_COLOR[currentResponse] ?? RSVP_COLOR.needsAction)
              }`}
            >
              {event.isOrganizer
                ? "Organizer"
                : (RSVP_LABEL[currentResponse] ?? "Pending")}
            </span>
          </div>

          <p className="text-xs text-slate-500 mt-0.5">
            {event.allDay
              ? "All day"
              : `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}
          </p>

          {event.attendees.length > 0 && (
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {event.attendees
                .slice(0, 2)
                .map((a) => a.email)
                .join(", ")}
              {event.attendees.length > 2 &&
                ` +${event.attendees.length - 2}`}
            </p>
          )}

          <div className="flex flex-wrap gap-1 mt-2">
            {event.meetingLink && (
              <a
                href={event.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-lg font-medium hover:bg-green-700"
              >
                Join
              </a>
            )}
            {event.canEdit && (
              <button
                onClick={onReschedule}
                className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg font-medium hover:bg-blue-100"
              >
                Reschedule
              </button>
            )}
            {event.canCancel && (
              <button
                onClick={onCancel}
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg font-medium hover:bg-red-100"
              >
                Cancel
              </button>
            )}
            {event.canRespond && currentResponse !== "accepted" && (
              <button
                onClick={() => handleRsvp("accepted")}
                disabled={rsvpLoading !== null}
                className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-lg font-medium hover:bg-green-100 disabled:opacity-50"
              >
                {rsvpLoading === "accepted" ? "..." : "Accept"}
              </button>
            )}
            {event.canRespond && currentResponse !== "tentative" && (
              <button
                onClick={() => handleRsvp("tentative")}
                disabled={rsvpLoading !== null}
                className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-lg font-medium hover:bg-yellow-100 disabled:opacity-50"
              >
                {rsvpLoading === "tentative" ? "..." : "Maybe"}
              </button>
            )}
            {event.canRespond && currentResponse !== "declined" && (
              <button
                onClick={() => handleRsvp("declined")}
                disabled={rsvpLoading !== null}
                className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50"
              >
                {rsvpLoading === "declined" ? "..." : "Decline"}
              </button>
            )}
            {event.canRequestChange && (
              <button
                onClick={onRequestChange}
                className="text-xs bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg font-medium hover:bg-slate-100"
              >
                Request Change
              </button>
            )}
          </div>

          {rsvpError && (
            <p className="text-xs text-red-600 mt-1.5">{rsvpError}</p>
          )}
        </div>
      </div>
    </div>
  );
});
