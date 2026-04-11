import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import NotificationBell from "@/components/NotificationBell";
import DashboardClient from "@/components/DashboardClient";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const prefs = await prisma.meetingPreference.findUnique({
    where: { userId: session.user.id },
    select: { preferredSlotMinutes: true },
  });
  const duration = prefs?.preferredSlotMinutes ?? 60;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-blue-600 text-lg">MeetAI</span>
          <nav className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-800 font-medium">
              Preferences
            </Link>
            <NotificationBell />
            <UserMenu user={session.user} />
          </nav>
        </div>
      </header>

      <DashboardClient durationMinutes={duration} />
    </div>
  );
}
