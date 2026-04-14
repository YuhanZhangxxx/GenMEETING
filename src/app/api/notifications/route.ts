import { NextRequest, NextResponse } from "next/server";
import { getAnySession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getAnySession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ notifications });
}

export async function PATCH(req: NextRequest) {
  const session = await getAnySession(req);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ids }: { ids: string[] } = await req.json();

  await prisma.notification.updateMany({
    where: { userId: session.user.id, id: { in: ids } },
    data: { read: true },
  });

  return NextResponse.json({ success: true });
}
