"use client";

import { useState } from "react";
import CalendarView from "@/components/CalendarView";
import RecommendationList from "@/components/RecommendationList";
import CreateMeetingModal from "@/components/CreateMeetingModal";
import AIAdvisor from "@/components/AIAdvisor";

interface Props {
  durationMinutes: number;
}

type RightTab = "ai" | "slots";
type CalView = "list" | "month";

const DURATION_OPTIONS = [30, 45, 60] as const;
type Duration = (typeof DURATION_OPTIONS)[number];

export default function DashboardClient({ durationMinutes }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("slots");
  const [calView, setCalView] = useState<CalView>("list");
  const [duration, setDuration] = useState<Duration>(
    (DURATION_OPTIONS.includes(durationMinutes as Duration) ? durationMinutes : 60) as Duration
  );

  function refresh() {
    setTimeout(() => setRefreshKey((k) => k + 1), 1000);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── Left column: Upcoming Meetings ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Upcoming Meetings</h2>

          <div className="flex items-center gap-2">
            {/* List / Month toggle */}
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setCalView("list")}
                title="List view"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  calView === "list"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {/* List icon */}
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="0" y="2" width="16" height="2" rx="1" />
                  <rect x="0" y="7" width="16" height="2" rx="1" />
                  <rect x="0" y="12" width="16" height="2" rx="1" />
                </svg>
                List
              </button>
              <button
                onClick={() => setCalView("month")}
                title="Month view"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  calView === "month"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {/* Calendar icon */}
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 1a1 1 0 0 1 1 1v1h6V2a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1V2a1 1 0 0 1 1-1zm9 4H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zm-7 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-6 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                </svg>
                Month
              </button>
            </div>

            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              <span className="text-base leading-none">+</span> New Meeting
            </button>
          </div>
        </div>

        <CalendarView view={calView} refreshKey={refreshKey} onRefresh={refresh} />
      </section>

      {/* ── Right column: AI Suggestions + Recommended Slots (tabbed) ── */}
      <section>
        <div className="flex items-center gap-1 mb-4 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setRightTab("slots")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              rightTab === "slots"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="text-sm">🗓</span> Recommended Slots
          </button>
          <button
            onClick={() => setRightTab("ai")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              rightTab === "ai"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="text-sm">✨</span> AI Suggestions
          </button>
        </div>

        {/* Always mounted — CSS hidden keeps AIAdvisor state alive */}
        <div className={rightTab === "slots" ? "block" : "hidden"}>
          <div className="flex items-center justify-end mb-3">
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    duration === d
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>
          <RecommendationList durationMinutes={duration} onBooked={refresh} />
        </div>

        <div className={rightTab === "ai" ? "block" : "hidden"}>
          <AIAdvisor onRefresh={refresh} />
        </div>
      </section>

      {showCreate && (
        <CreateMeetingModal
          onClose={() => setShowCreate(false)}
          onSuccess={refresh}
        />
      )}
    </main>
  );
}
