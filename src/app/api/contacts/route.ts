import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contacts = await prisma.favoriteContact.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, name }: { email: string; name?: string } = await req.json();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const contact = await prisma.favoriteContact.upsert({
    where: { userId_email: { userId: session.user.id, email } },
    create: { userId: session.user.id, email, name: name?.trim() || null },
    update: { name: name?.trim() || null },
  });
  return NextResponse.json({ contact });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email }: { email: string } = await req.json();
  await prisma.favoriteContact.deleteMany({
    where: { userId: session.user.id, email },
  });
  return NextResponse.json({ success: true });
}
