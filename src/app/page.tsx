import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 px-4">
      <div className="max-w-xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full">
          AI-Powered Scheduling
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
          Your meetings,{" "}
          <span className="text-blue-600">intelligently scheduled</span>
        </h1>

        <p className="text-lg text-slate-500">
          Connect your Google Calendar and let the AI find the best meeting times
          based on your preferences — automatically.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors text-center"
          >
            Get started
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-8 text-left">
          {[
            {
              title: "Syncs your calendar",
              desc: "Reads Google Calendar events automatically",
            },
            {
              title: "Learns your preferences",
              desc: "Set work hours, buffers, and blackout times",
            },
            {
              title: "Recommends slots",
              desc: "Top 3 scored time slots, ready to book",
            },
          ].map((f) => (
            <div key={f.title} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <p className="font-semibold text-sm text-slate-800">{f.title}</p>
              <p className="text-xs text-slate-500 mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
