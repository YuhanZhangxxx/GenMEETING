"use client";

import { useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
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

export default function MonthCalendarView({
  events,
  onReschedule,
  onCancel,
  onRequestChange,
  onRsvpSuccess,
}: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  // Build calendar grid days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let cursor = calStart;
  while (cursor <= calEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  function eventsOnDay(date: Date) {
    return events.filter((e) => isSameDay(parseISO(e.startTime), date));
  }

  const selectedDayEvents = eventsOnDay(selectedDay);

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-700">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 text-lg leading-none"
        >
          ›
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-0.5">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-medium text-slate-400 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-t border-l border-slate-100 rounded-lg overflow-hidden">
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(day);
          const inMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDay);
          const today = isToday(day);

          return (
            <div
              key={i}
              onClick={() => setSelectedDay(day)}
              className={`border-b border-r border-slate-100 min-h-[62px] p-1 cursor-pointer transition-colors select-none ${
                isSelected
                  ? "bg-blue-50"
                  : today
                  ? "bg-blue-50/30"
                  : inMonth
                  ? "bg-white hover:bg-slate-50"
                  : "bg-slate-50/50 hover:bg-slate-100/60"
              }`}
            >
              {/* Day number */}
              <div
                className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full mb-0.5 font-semibold mx-auto ${
                  today
                    ? "bg-blue-600 text-white"
                    : isSelected
                    ? "text-blue-600 font-bold"
                    : inMonth
                    ? "text-slate-700"
                    : "text-slate-300"
                }`}
              >
                {format(day, "d")}
              </div>

              {/* Event chips */}
              {dayEvents.slice(0, 2).map((e, j) => (
                <div
                  key={j}
                  className={`text-[9px] truncate px-1 py-px rounded mb-px leading-tight font-medium ${
                    e.isOrganizer
                      ? "bg-blue-100 text-blue-700"
                      : "bg-violet-100 text-violet-700"
                  }`}
                >
                  {e.allDay ? "·" : format(parseISO(e.startTime), "H:mm")}{" "}
                  {e.title}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-[9px] text-slate-400 px-1 leading-tight">
                  +{dayEvents.length - 2} more
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      <div className="mt-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-slate-700">
            {format(selectedDay, "EEEE, MMMM d")}
          </span>
          <span className="text-xs text-slate-400">
            {selectedDayEvents.length === 0
              ? "No meetings"
              : `${selectedDayEvents.length} meeting${selectedDayEvents.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {selectedDayEvents.length === 0 ? (
          <p className="text-xs text-slate-400 py-1 italic">
            No meetings scheduled.
          </p>
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

function DayEventCard({
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
        </div>
      </div>
    </div>
  );
}
