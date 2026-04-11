"use client";

import { useState, useEffect } from "react";
import { format, addMinutes, parseISO } from "date-fns";
import AttendeePicker from "@/components/AttendeePicker";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const DURATIONS = [15, 30, 45, 60, 90, 120];

function toLocalDatetimeValue(d: Date) {
  // Returns "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function roundToNext30(d: Date) {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

type EventType = "meeting" | "activity";

export default function CreateMeetingModal({ onClose, onSuccess }: Props) {
  const defaultStart = roundToNext30(new Date());
  const [eventType, setEventType] = useState<EventType>("meeting");
  const [title, setTitle] = useState("");
  const [startValue, setStartValue] = useState(toLocalDatetimeValue(defaultStart));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [addMeetLink, setAddMeetLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState<"google" | "microsoft">("google");

  const isMeeting = eventType === "meeting";

  useEffect(() => {
    fetch("/api/auth/connected-accounts")
      .then((r) => r.json())
      .then((d) => {
        const providers: string[] = d.accounts ?? [];
        setConnectedProviders(providers);
        if (!providers.includes("google") && providers.includes("microsoft")) {
          setProvider("microsoft");
          setAddMeetLink(false);
        }
      });
  }, []);

  const startDate = parseISO(startValue);
  const endDate = addMinutes(startDate, durationMinutes);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          description: description.trim() || undefined,
          attendees: isMeeting ? attendees : [],
          addMeetLink: isMeeting ? addMeetLink : false,
          provider,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {isMeeting ? "New Meeting" : "New Activity"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Event type toggle */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setEventType("meeting")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              isMeeting ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>👥</span> Meeting
          </button>
          <button
            type="button"
            onClick={() => setEventType("activity")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              !isMeeting ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span>📌</span> Activity
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Calendar picker — only when multiple providers connected */}
          {connectedProviders.length > 1 && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Add to calendar</label>
              <div className="flex gap-2">
                {connectedProviders.includes("google") && (
                  <button
                    type="button"
                    onClick={() => { setProvider("google"); setAddMeetLink(true); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      provider === "google"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Google Calendar
                  </button>
                )}
                {connectedProviders.includes("microsoft") && (
                  <button
                    type="button"
                    onClick={() => { setProvider("microsoft"); setAddMeetLink(false); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors ${
                      provider === "microsoft"
                        ? "border-blue-700 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#00a4ef" />
                      <rect x="1" y="11" width="9" height="9" fill="#7fba00" />
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                    </svg>
                    Outlook
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isMeeting ? "e.g. Weekly Sync" : "e.g. Gym, Focus time, Lunch"}
              autoFocus
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          {/* Date & time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Start</label>
              <input
                type="datetime-local"
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Duration</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* End time preview */}
          <p className="text-xs text-slate-400 -mt-2">
            Ends at {format(endDate, "h:mm a, EEE MMM d")}
          </p>

          {/* Attendees — meeting only */}
          {isMeeting && (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Invite people</label>
              <AttendeePicker selected={attendees} onChange={setAttendees} />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Description <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda, notes..."
              rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>

          {/* Online meeting link — meeting only */}
          {isMeeting && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={addMeetLink}
                onChange={(e) => setAddMeetLink(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-slate-700">
                {provider === "microsoft" ? "Add Teams meeting link" : "Add Google Meet link"}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : isMeeting ? "Create meeting" : "Create activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
