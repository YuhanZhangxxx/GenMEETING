"use client";

import { useEffect, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import AttendeePicker from "@/components/AttendeePicker";

interface Slot {
  start: string;
  end: string;
  score: number;
  reasons: string[];
}

interface BookingForm {
  slot: Slot;
  title: string;
  attendees: string[];
  addMeetLink: boolean;
  provider: "google" | "microsoft";
}

interface Props {
  durationMinutes: number;
  defaultTitle?: string;
  onBooked?: () => void;
}

export default function RecommendationList({
  durationMinutes,
  defaultTitle = "New Meeting",
  onBooked,
}: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingForm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [connectedProviders, setConnectedProviders] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/auth/connected-accounts")
      .then((r) => r.json())
      .then((d) => setConnectedProviders(d.accounts ?? []));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/recommendations?duration=${durationMinutes}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSlots(data.slots ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [durationMinutes]);

  useEffect(() => { load(); }, [load]);

  function openBooking(slot: Slot) {
    const defaultProvider = connectedProviders.includes("google") ? "google" : "microsoft";
    setBookingForm({
      slot,
      title: defaultTitle,
      attendees: [],
      addMeetLink: defaultProvider === "google",
      provider: defaultProvider,
    });
  }

  async function handleConfirmBook() {
    if (!bookingForm) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/calendar/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: bookingForm.title,
          startTime: bookingForm.slot.start,
          endTime: bookingForm.slot.end,
          attendees: bookingForm.attendees,
          addMeetLink: bookingForm.addMeetLink,
          provider: bookingForm.provider,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setBookedSlots((prev) => new Set(Array.from(prev).concat(bookingForm.slot.start)));
      setBookingForm(null);
      onBooked?.();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-2 underline">Retry</button>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No available slots found. Try adjusting your preferences.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {slots.map((slot, idx) => {
          const isBooked = bookedSlots.has(slot.start);
          return (
            <div
              key={slot.start}
              className={`relative flex items-start gap-4 rounded-xl border p-4 transition-all ${
                isBooked ? "bg-green-50 border-green-200" : "bg-white border-slate-100 hover:shadow-sm"
              }`}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                idx === 0 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              }`}>
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800">{format(parseISO(slot.start), "EEEE, MMM d")}</p>
                <p className="text-sm text-slate-600">
                  {format(parseISO(slot.start), "h:mm a")} – {format(parseISO(slot.end), "h:mm a")}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {slot.reasons.map((r) => (
                    <span key={r} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{r}</span>
                  ))}
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0 w-16">
                <span className="text-xs text-slate-400">Score</span>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${Math.min(slot.score, 100)}%` }} />
                </div>
                <span className="text-xs font-mono text-slate-500">{slot.score}</span>
              </div>

              <button
                onClick={() => openBooking(slot)}
                disabled={isBooked}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isBooked
                    ? "bg-green-100 text-green-700 cursor-default"
                    : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
                }`}
              >
                {isBooked ? "Booked" : "Book"}
              </button>
            </div>
          );
        })}

        <button onClick={load} className="w-full text-sm text-slate-400 hover:text-slate-600 py-2">
          Refresh recommendations
        </button>
      </div>

      {/* Booking modal */}
      {bookingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Book Meeting</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {format(parseISO(bookingForm.slot.start), "EEE, MMM d · h:mm a")} –{" "}
                  {format(parseISO(bookingForm.slot.end), "h:mm a")}
                </p>
              </div>
              <button onClick={() => setBookingForm(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Calendar picker */}
            {connectedProviders.length > 1 && (
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Add to calendar</label>
                <div className="flex gap-2">
                  {connectedProviders.includes("google") && (
                    <button
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, provider: "google", addMeetLink: true })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        bookingForm.provider === "google"
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
                      Google
                    </button>
                  )}
                  {connectedProviders.includes("microsoft") && (
                    <button
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, provider: "microsoft", addMeetLink: false })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        bookingForm.provider === "microsoft"
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
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Title</label>
              <input
                type="text"
                value={bookingForm.title}
                onChange={(e) => setBookingForm({ ...bookingForm, title: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Meeting title"
              />
            </div>

            {/* Attendees */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Invite people</label>
              <AttendeePicker
                selected={bookingForm.attendees}
                onChange={(emails) => setBookingForm({ ...bookingForm, attendees: emails })}
              />
            </div>

            {/* Online meeting link */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={bookingForm.addMeetLink}
                onChange={(e) => setBookingForm({ ...bookingForm, addMeetLink: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-slate-700">
                {bookingForm.provider === "microsoft" ? "Add Teams meeting link" : "Add Google Meet link"}
              </span>
            </label>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setBookingForm(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleConfirmBook}
                disabled={submitting || !bookingForm.title.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create meeting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
