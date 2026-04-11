"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import type { MeetingEvent } from "@/types";

interface Props {
  event: MeetingEvent;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CancelModal({ event, onClose, onSuccess }: Props) {
  const [notifyAttendees, setNotifyAttendees] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${event.googleEventId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyAttendees }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">Cancel Meeting</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
          <p className="font-semibold text-slate-800 text-sm">{event.title}</p>
          <p className="text-xs text-slate-500">
            {format(parseISO(event.startTime), "EEE, MMM d · h:mm a")}
          </p>
          {event.attendees.length > 0 && (
            <p className="text-xs text-slate-400">
              {event.attendees.length} attendee{event.attendees.length > 1 ? "s" : ""}
            </p>
          )}
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyAttendees}
            onChange={(e) => setNotifyAttendees(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm text-slate-700">Notify attendees via Google Calendar</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Keep it
          </button>
          <button
            onClick={handleCancel}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? "Cancelling..." : "Cancel meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
