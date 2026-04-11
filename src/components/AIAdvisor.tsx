"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";

interface AISuggestion {
  type: "reschedule" | "rsvp" | "cancel" | "conflict" | "info";
  eventId?: string;
  eventTitle?: string;
  eventStartTime?: string; // ISO
  message: string;
  action?: {
    label: string;
    newStartTime?: string;
    newEndTime?: string;
    response?: "accepted" | "declined" | "tentative";
  };
}

interface Props {
  onRefresh?: () => void;
}

const TYPE_CONFIG: Record<
  string,
  { border: string; bg: string; badge: string; icon: string; label: string }
> = {
  conflict: {
    border: "border-red-400",
    bg: "bg-red-50",
    badge: "bg-red-100 text-red-700",
    icon: "⚠️",
    label: "Conflict",
  },
  rsvp: {
    border: "border-blue-400",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    icon: "✉️",
    label: "RSVP Needed",
  },
  reschedule: {
    border: "border-amber-400",
    bg: "bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    icon: "🔄",
    label: "Reschedule",
  },
  cancel: {
    border: "border-red-300",
    bg: "bg-red-50",
    badge: "bg-red-100 text-red-600",
    icon: "🚫",
    label: "Consider Cancel",
  },
  info: {
    border: "border-slate-300",
    bg: "bg-slate-50",
    badge: "bg-slate-100 text-slate-600",
    icon: "💡",
    label: "Tip",
  },
};

// Stable key per suggestion so applied state survives re-analysis
function suggestionKey(s: AISuggestion) {
  return `${s.eventId ?? "global"}_${s.type}_${s.message.slice(0, 30)}`;
}

export default function AIAdvisor({ onRefresh }: Props) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keyed by suggestionKey — persists across re-analysis runs
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function analyze() {
    setLoading(true);
    setError(null);
    setActionError(null);
    fetch("/api/ai-advisor")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSuggestions(data.suggestions ?? []);
        setHasRun(true);
      })
      .catch((e: Error) => {
        setError(e.message);
        setHasRun(true);
      })
      .finally(() => setLoading(false));
  }

  async function applyAction(suggestion: AISuggestion) {
    if (!suggestion.action || !suggestion.eventId) return;
    const key = suggestionKey(suggestion);
    setApplying(key);
    setActionError(null);

    try {
      const { action, eventId, type } = suggestion;
      let url = "";
      let body: Record<string, unknown> = {};

      if (type === "rsvp" && action.response) {
        url = `/api/meetings/${eventId}/respond`;
        body = { response: action.response };
      } else if (type === "reschedule" && action.newStartTime && action.newEndTime) {
        url = `/api/meetings/${eventId}/reschedule`;
        body = { startTime: action.newStartTime, endTime: action.newEndTime };
      } else if (type === "cancel") {
        url = `/api/meetings/${eventId}/cancel`;
        body = { notifyAttendees: true };
      }

      if (!url) return;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setApplied((prev) => new Set(Array.from(prev).concat(key)));
        onRefresh?.();
      } else {
        const data = await res.json();
        setActionError(data.error || "Action failed. Please try manually.");
      }
    } finally {
      setApplying(null);
    }
  }

  // ── Initial state: never analyzed yet ──
  if (!hasRun && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center text-2xl">
          ✨
        </div>
        <div>
          <p className="font-semibold text-slate-700 text-sm">AI Schedule Advisor</p>
          <p className="text-xs text-slate-400 mt-1">
            Analyzes your upcoming meetings and suggests actions.
          </p>
        </div>
        <button
          onClick={analyze}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          Analyze my schedule
        </button>
        <p className="text-[11px] text-slate-300">Powered by GPT-4o mini</p>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Analyzing your schedule...
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Results ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {suggestions.length > 0
            ? `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""}`
            : "Analysis complete"}
        </span>
        <button
          onClick={analyze}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          Re-analyze
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {actionError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-700 text-sm">
          {actionError}
        </div>
      )}

      {suggestions.length === 0 && !error && (
        <div className="text-center py-10 text-slate-400 text-sm">
          <div className="text-2xl mb-2">✅</div>
          Your schedule looks good — no suggestions right now.
        </div>
      )}

      {suggestions.map((s, i) => {
        const config = TYPE_CONFIG[s.type] ?? TYPE_CONFIG.info;
        const key = suggestionKey(s);
        const isApplied = applied.has(key);
        const isApplying = applying === key;

        return (
          <div
            key={i}
            className={`rounded-xl border border-l-4 p-3 transition-opacity ${config.border} ${config.bg} ${isApplied ? "opacity-60" : ""}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm mt-0.5 flex-shrink-0">{config.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <span className={`text-[10px] font-semibold px-1.5 py-px rounded ${config.badge}`}>
                    {config.label}
                  </span>
                  {s.eventTitle && (
                    <span className="text-[11px] text-slate-600 font-medium truncate">{s.eventTitle}</span>
                  )}
                  {s.eventStartTime && (
                    <span className="text-[11px] text-slate-400">
                      {format(parseISO(s.eventStartTime), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 leading-snug">{s.message}</p>

                <div className="mt-2 flex items-center gap-2">
                  {s.action && !isApplied && (
                    <button
                      onClick={() => applyAction(s)}
                      disabled={isApplying || applying !== null}
                      className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {isApplying ? "Applying..." : s.action.label}
                    </button>
                  )}
                  {isApplied && (
                    <span className="text-xs text-green-600 font-medium">✓ Applied</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
