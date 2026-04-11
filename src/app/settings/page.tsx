import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PreferencesForm from "@/components/PreferencesForm";
import ContactsManager from "@/components/ContactsManager";
import ConnectedAccounts from "@/components/ConnectedAccounts";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { linked, error } = await searchParams;

  // Pre-fetch connected accounts server-side to avoid flash
  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    select: { provider: true },
  });
  const connectedProviders = accounts.map((a) => a.provider);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 text-sm">
            ← Back
          </Link>
          <span className="font-bold text-blue-600 text-lg">MeetAI</span>
          <span className="text-slate-400 text-sm">/ Settings</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Connected Accounts */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Connected Accounts</h2>
          <p className="text-sm text-slate-500 mb-5">
            Link your calendar accounts to aggregate all events in one place.
          </p>
          <ConnectedAccounts
            initialLinked={connectedProviders}
            flashLinked={linked ?? null}
            flashError={error ?? null}
          />
        </div>

        {/* Scheduling Preferences */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h1 className="text-xl font-bold text-slate-900 mb-1">Scheduling Preferences</h1>
          <p className="text-sm text-slate-500 mb-6">
            These rules guide the AI when recommending meeting times.
          </p>
          <PreferencesForm />
        </div>

        {/* Favorite Contacts */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Favorite Contacts</h2>
          <p className="text-sm text-slate-500 mb-5">
            Save frequently invited people for quick access when booking meetings.
          </p>
          <ContactsManager />
        </div>
      </main>
    </div>
  );
}
