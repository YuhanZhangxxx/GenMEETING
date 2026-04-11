import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Deletes the stored Google OAuth account record for the current user so that
 * the next sign-in creates a fresh token with the correct scopes.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Remove the Google account entry (keeps the User row intact)
  await prisma.account.deleteMany({
    where: { userId, provider: "google" },
  });

  // Also clear cached events — they were fetched with the bad token
  await prisma.calendarEventCache.deleteMany({ where: { userId } });

  return NextResponse.json({ success: true });
}
