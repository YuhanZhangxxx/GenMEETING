import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signMobileJWT } from "@/lib/mobile-auth";

/**
 * POST /api/auth/mobile-token
 * Mobile OAuth exchange: validates a provider access token, finds/creates the user,
 * and returns a signed JWT for use as Bearer token in subsequent API calls.
 *
 * Body: { provider: "google" | "microsoft", accessToken: string, refreshToken?: string }
 * Response: { token: string, user: { id, email, name, image } }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { provider, accessToken, refreshToken } = body as {
    provider?: string;
    accessToken?: string;
    refreshToken?: string;
  };

  if (!provider || !accessToken) {
    return NextResponse.json(
      { error: "provider and accessToken are required" },
      { status: 400 }
    );
  }
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "provider must be google or microsoft" }, { status: 400 });
  }

  // --- Validate token and get user info from provider ---
  let email: string;
  let name: string | null = null;
  let image: string | null = null;
  let providerAccountId: string;

  try {
    if (provider === "google") {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "Invalid Google access token" }, { status: 401 });
      }
      const info = await res.json();
      email = info.email;
      name = info.name ?? null;
      image = info.picture ?? null;
      providerAccountId = info.sub;
    } else {
      // microsoft
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "Invalid Microsoft access token" }, { status: 401 });
      }
      const info = await res.json();
      email = info.mail ?? info.userPrincipalName;
      name = info.displayName ?? null;
      image = null;
      providerAccountId = info.id;
    }
  } catch {
    return NextResponse.json({ error: "Token validation failed" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: "Could not retrieve email from provider" }, { status: 400 });
  }

  // --- Find or create user ---
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name, image } });
  }

  // --- Update or create Account record ---
  const existing = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
  });

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: {
        access_token: accessToken,
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
      },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider,
        providerAccountId,
        access_token: accessToken,
        refresh_token: refreshToken ?? null,
        token_type: "Bearer",
        scope:
          provider === "google"
            ? "openid email profile https://www.googleapis.com/auth/calendar"
            : "openid email profile User.Read Calendars.ReadWrite",
      },
    });
  }

  const token = await signMobileJWT({ userId: user.id, email: user.email! });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
  });
}
