"use client";

import { useEffect, useState } from "react";

const PROVIDERS = [
  {
    id: "google",
    name: "Google Calendar",
    description: "Sync Google Calendar events",
    color: "bg-red-500",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
  },
  {
    id: "microsoft",
    name: "Microsoft Outlook",
    description: "Sync Outlook / Office 365 calendar",
    color: "bg-blue-700",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 21 21">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#00a4ef" />
        <rect x="1" y="11" width="9" height="9" fill="#7fba00" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    ),
  },
] as const;

type Provider = (typeof PROVIDERS)[number]["id"];

const ERROR_MESSAGES: Record<string, string> = {
  already_linked: "This account type is already connected.",
  account_taken: "This account is already linked to a different user.",
  expired_state: "The authorization expired. Please try again.",
  link_failed: "Failed to connect account. Please try again.",
  oauth_denied: "Authorization was cancelled.",
  unknown_provider: "Unknown provider.",
};

export default function ConnectedAccounts({
  initialLinked,
  flashLinked,
  flashError,
}: {
  initialLinked?: string[];
  flashLinked?: string | null;
  flashError?: string | null;
}) {
  const [connected, setConnected] = useState<string[]>(initialLinked ?? []);
  const [loading, setLoading] = useState(!initialLinked);
  const [unlinking, setUnlinking] = useState<Provider | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(
    flashLinked
      ? { type: "success", msg: `${flashLinked.charAt(0).toUpperCase() + flashLinked.slice(1)} account connected successfully.` }
      : flashError
      ? { type: "error", msg: ERROR_MESSAGES[flashError] ?? "Something went wrong." }
      : null
  );

  useEffect(() => {
    if (!initialLinked) {
      fetch("/api/auth/connected-accounts")
        .then((r) => r.json())
        .then((d) => setConnected(d.accounts ?? []))
        .finally(() => setLoading(false));
    }
  }, [initialLinked]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleUnlink(provider: Provider) {
    setUnlinking(provider);
    try {
      const res = await fetch(`/api/auth/unlink/${provider}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setConnected((prev) => prev.filter((p) => p !== provider));
        setToast({ type: "success", msg: `${provider.charAt(0).toUpperCase() + provider.slice(1)} account disconnected.` });
      } else {
        setToast({ type: "error", msg: data.error ?? "Failed to unlink account." });
      }
    } finally {
      setUnlinking(null);
    }
  }

  if (loading) {
    return <div className="text-sm text-slate-400 py-2">Loading connected accounts...</div>;
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`text-sm px-4 py-2.5 rounded-xl border ${
            toast.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {PROVIDERS.map((p) => {
        const isConnected = connected.includes(p.id);
        const isLastAccount = connected.length <= 1 && isConnected;

        return (
          <div
            key={p.id}
            className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                {p.icon}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-800">{p.name}</div>
                <div className={`text-xs mt-0.5 ${isConnected ? "text-green-600 font-medium" : "text-slate-400"}`}>
                  {isConnected ? "Connected" : p.description}
                </div>
              </div>
            </div>

            {isConnected ? (
              <button
                onClick={() => handleUnlink(p.id)}
                disabled={unlinking === p.id || isLastAccount}
                title={isLastAccount ? "Cannot unlink your only account" : undefined}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2 py-1"
              >
                {unlinking === p.id ? "Disconnecting..." : "Disconnect"}
              </button>
            ) : (
              <a
                href={`/api/auth/link/${p.id}/start`}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Connect
              </a>
            )}
          </div>
        );
      })}

      <p className="text-xs text-slate-400 pt-1">
        At least one account must remain connected. All connected calendars are aggregated in your dashboard.
      </p>
    </div>
  );
}
