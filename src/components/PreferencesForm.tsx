"use client";

import { useEffect, useState } from "react";
import type { UserPreferences, BlackoutTime } from "@/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const DEFAULT: UserPreferences = {
  workDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "18:00",
  bufferMinutes: 15,
  blackoutTimes: [],
  preferredSlotMinutes: 60,
  timezone: "UTC",
  autoReschedule: false,
};

export default function PreferencesForm() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) setPrefs(data.preferences);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: number) {
    setPrefs((p) => ({
      ...p,
      workDays: p.workDays.includes(day)
        ? p.workDays.filter((d) => d !== day)
        : [...p.workDays, day].sort(),
    }));
  }

  function addBlackout() {
    setPrefs((p) => ({
      ...p,
      blackoutTimes: [...p.blackoutTimes, { day: -1, start: "12:00", end: "13:00" }],
    }));
  }

  function updateBlackout(idx: number, patch: Partial<BlackoutTime>) {
    setPrefs((p) => ({
      ...p,
      blackoutTimes: p.blackoutTimes.map((b, i) =>
        i === idx ? { ...b, ...patch } : b
      ),
    }));
  }

  function removeBlackout(idx: number) {
    setPrefs((p) => ({
      ...p,
      blackoutTimes: p.blackoutTimes.filter((_, i) => i !== idx),
    }));
  }

  if (loading) {
    return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Work days */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Work Days</h3>
        <div className="flex gap-2 flex-wrap">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                prefs.workDays.includes(i)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Work hours */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Work Hours</h3>
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Start</label>
            <input
              type="time"
              value={prefs.workStart}
              onChange={(e) => setPrefs((p) => ({ ...p, workStart: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <span className="text-slate-400 mt-4">–</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">End</label>
            <input
              type="time"
              value={prefs.workEnd}
              onChange={(e) => setPrefs((p) => ({ ...p, workEnd: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      </section>

      {/* Buffer & duration */}
      <section className="grid grid-cols-2 gap-6">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-2">
            Buffer Between Meetings
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={60}
              step={5}
              value={prefs.bufferMinutes}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, bufferMinutes: parseInt(e.target.value) || 0 }))
              }
              className="w-20 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <span className="text-sm text-slate-500">min</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-2">
            Default Meeting Length
          </label>
          <div className="flex items-center gap-2">
            <select
              value={prefs.preferredSlotMinutes}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, preferredSlotMinutes: parseInt(e.target.value) }))
              }
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} hr`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Timezone */}
      <section>
        <label className="text-sm font-semibold text-slate-700 block mb-2">
          Timezone
        </label>
        <select
          value={prefs.timezone}
          onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </section>

      {/* Blackout times */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Blackout Times</h3>
          <button
            type="button"
            onClick={addBlackout}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add
          </button>
        </div>

        {prefs.blackoutTimes.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No blackout times set.</p>
        ) : (
          <div className="space-y-2">
            {prefs.blackoutTimes.map((bo, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-2">
                <select
                  value={bo.day}
                  onChange={(e) => updateBlackout(idx, { day: parseInt(e.target.value) })}
                  className="border border-slate-200 rounded px-2 py-1 text-xs"
                >
                  <option value={-1}>Every day</option>
                  {DAY_LABELS.map((l, d) => (
                    <option key={d} value={d}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={bo.start}
                  onChange={(e) => updateBlackout(idx, { start: e.target.value })}
                  className="border border-slate-200 rounded px-2 py-1 text-xs"
                />
                <span className="text-slate-400 text-xs">–</span>
                <input
                  type="time"
                  value={bo.end}
                  onChange={(e) => updateBlackout(idx, { end: e.target.value })}
                  className="border border-slate-200 rounded px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeBlackout(idx)}
                  className="text-slate-400 hover:text-red-500 ml-auto text-lg leading-none"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Auto-reschedule */}
      <section className="flex items-center gap-3">
        <input
          id="auto-reschedule"
          type="checkbox"
          checked={prefs.autoReschedule}
          onChange={(e) => setPrefs((p) => ({ ...p, autoReschedule: e.target.checked }))}
          className="w-4 h-4 accent-blue-600"
        />
        <label htmlFor="auto-reschedule" className="text-sm text-slate-700">
          Allow automatic rescheduling of low-priority meetings
        </label>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save Preferences"}
      </button>
    </form>
  );
}
