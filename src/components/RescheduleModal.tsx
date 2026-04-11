"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import type { MeetingEvent, ChangeRequestSlot } from "@/types";

interface Props {
  event: MeetingEvent;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RescheduleModal({ event, onClose, onSuccess }: Props) {
  const [slots, setSlots] = useState<ChangeRequestSlot[]>([]);
  const [selected, setSelected] = useState<ChangeRequestSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationMs = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  useEffect(() => {
    fetch(`/api/recommendations?duration=${durationMinutes}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setError("Failed to load suggestions"))
      .finally(() => setLoading(false));
  }, [durationMinutes]);

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${event.googleEventId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: selected.start, endTime: selected.end }),
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Reschedule Meeting</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate max-w-xs">{event.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
          <span className="font-medium">Current: </span>
          {format(parseISO(event.startTime), "EEE MMM d, h:mm a")} – {format(parseISO(event.endTime), "h:mm a")}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">Suggested new times</p>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse"/>)}</div>
          ) : (
            <div className="space-y-2">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  onClick={() => setSelected(slot)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                    selected?.start === slot.start
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-blue-300"
                  }`}
                >
                  <p className="font-medium text-sm text-slate-800">
                    {format(parseISO(slot.start), "EEE, MMM d")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {format(parseISO(slot.start), "h:mm a")} – {format(parseISO(slot.end), "h:mm a")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || submitting}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Rescheduling..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
