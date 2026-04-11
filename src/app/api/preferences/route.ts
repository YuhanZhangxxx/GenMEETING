import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserPreferences } from "@/types";

const DEFAULT_PREFS: UserPreferences = {
  workDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "18:00",
  bufferMinutes: 15,
  blackoutTimes: [],
  preferredSlotMinutes: 60,
  timezone: "UTC",
  autoReschedule: false,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const row = await prisma.meetingPreference.findUnique({ where: { userId } });

  if (!row) {
    return NextResponse.json({ preferences: DEFAULT_PREFS });
  }

  const preferences: UserPreferences = {
    workDays: row.workDays.split(",").map(Number),
    workStart: row.workStart,
    workEnd: row.workEnd,
    bufferMinutes: row.bufferMinutes,
    blackoutTimes: JSON.parse(row.blackoutTimes),
    preferredSlotMinutes: row.preferredSlotMinutes,
    timezone: row.timezone,
    autoReschedule: row.autoReschedule,
  };

  return NextResponse.json({ preferences });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const body: UserPreferences = await req.json();

  await prisma.meetingPreference.upsert({
    where: { userId },
    create: {
      userId,
      workDays: body.workDays.join(","),
      workStart: body.workStart,
      workEnd: body.workEnd,
      bufferMinutes: body.bufferMinutes,
      blackoutTimes: JSON.stringify(body.blackoutTimes ?? []),
      preferredSlotMinutes: body.preferredSlotMinutes,
      timezone: body.timezone,
      autoReschedule: body.autoReschedule ?? false,
    },
    update: {
      workDays: body.workDays.join(","),
      workStart: body.workStart,
      workEnd: body.workEnd,
      bufferMinutes: body.bufferMinutes,
      blackoutTimes: JSON.stringify(body.blackoutTimes ?? []),
      preferredSlotMinutes: body.preferredSlotMinutes,
      timezone: body.timezone,
      autoReschedule: body.autoReschedule ?? false,
    },
  });

  return NextResponse.json({ success: true });
}
