import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { provider } = await params;

  const accounts = await prisma.account.findMany({ where: { userId } });
  if (accounts.length <= 1) {
    return NextResponse.json(
      { error: "Cannot unlink your only account. You must keep at least one connected." },
      { status: 400 }
    );
  }

  const target = accounts.find((a) => a.provider === provider);
  if (!target) {
    return NextResponse.json({ error: "Account not linked" }, { status: 404 });
  }

  // Delete account and its cached events
  const cacheSource = provider === "microsoft" ? "outlook" : provider;
  await Promise.all([
    prisma.account.delete({ where: { id: target.id } }),
    prisma.calendarEventCache.deleteMany({ where: { userId, source: cacheSource } }),
  ]);

  return NextResponse.json({ ok: true });
}
