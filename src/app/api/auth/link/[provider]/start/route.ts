import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const VALID_PROVIDERS = ["google", "microsoft"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function buildAuthUrl(provider: Provider, token: string): string {
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${BASE_URL}/api/auth/link/google/callback`,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/calendar",
      access_type: "offline",
      prompt: "consent",
      state: token,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  } else {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      response_type: "code",
      redirect_uri: `${BASE_URL}/api/auth/link/microsoft/callback`,
      scope:
        "openid profile email offline_access https://graph.microsoft.com/Calendars.ReadWrite",
      response_mode: "query",
      state: token,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { provider } = await params;
  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    return NextResponse.redirect(new URL("/settings?error=unknown_provider", req.url));
  }

  // Check if already linked
  const existing = await prisma.account.findFirst({
    where: { userId: session.user.id, provider },
  });
  if (existing) {
    return NextResponse.redirect(new URL("/settings?error=already_linked", req.url));
  }

  // Clean up expired link states for this user
  await prisma.linkState.deleteMany({
    where: { userId: session.user.id, expiresAt: { lt: new Date() } },
  });

  const linkState = await prisma.linkState.create({
    data: {
      userId: session.user.id,
      provider,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });

  return NextResponse.redirect(buildAuthUrl(provider as Provider, linkState.token));
}
