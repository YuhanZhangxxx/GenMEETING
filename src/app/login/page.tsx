"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginInner() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 space-y-4 text-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="text-slate-500 text-sm mt-1">
            Connect your calendar to get started
          </p>
        </div>

        {/* Google */}
        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl py-3 px-4 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-xs text-slate-400">or</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {/* Microsoft */}
        <button
          onClick={() => signIn("microsoft", { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 border border-slate-200 rounded-xl py-3 px-4 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 21 21">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#00a4ef" />
            <rect x="1" y="11" width="9" height="9" fill="#7fba00" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Continue with Microsoft
        </button>

        <p className="text-xs text-slate-400">
          We request calendar read/write access to find and create meetings on your behalf.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
