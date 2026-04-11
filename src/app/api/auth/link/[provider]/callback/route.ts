import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

async function exchangeGoogleCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${BASE_URL}/api/auth/link/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google token exchange failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function getGoogleProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to get Google profile");
  return res.json() as Promise<{ sub: string; email: string }>;
}

async function exchangeMicrosoftCode(code: string) {
  const res = await fetch(
    `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: `${BASE_URL}/api/auth/link/microsoft/callback`,
        grant_type: "authorization_code",
        scope:
          "openid profile email offline_access https://graph.microsoft.com/Calendars.ReadWrite",
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Microsoft token exchange failed: ${JSON.stringify(err)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** Parse the id_token JWT payload without verifying signature — safe for extracting claims. */
function parseIdToken(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid id_token format");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
}

/** Get Microsoft user's unique object ID from the id_token (no Graph API call needed). */
function getMicrosoftProviderAccountId(tokens: Record<string, unknown>): string {
  const idToken = tokens.id_token as string | undefined;
  if (!idToken) throw new Error("No id_token in Microsoft token response");
  const claims = parseIdToken(idToken);
  // oid is the stable object ID across tenants; fall back to sub
  const oid = (claims.oid ?? claims.sub) as string | undefined;
  if (!oid) throw new Error("Missing oid/sub in Microsoft id_token");
  return oid;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const { provider } = await params;

  const redirect = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (oauthError) return redirect(`/settings?error=oauth_denied`);
  if (!code || !state) return redirect(`/settings?error=missing_params`);

  // Verify link state
  const linkState = await prisma.linkState.findUnique({ where: { token: state } });
  if (!linkState || linkState.expiresAt < new Date() || linkState.provider !== provider) {
    if (linkState) await prisma.linkState.delete({ where: { token: state } }).catch(() => {});
    return redirect(`/settings?error=expired_state`);
  }

  const userId = linkState.userId;

  try {
    let tokens: Record<string, unknown>;
    let providerAccountId: string;

    if (provider === "google") {
      tokens = await exchangeGoogleCode(code);
      const profile = await getGoogleProfile(tokens.access_token as string);
      providerAccountId = profile.sub;
    } else if (provider === "microsoft") {
      tokens = await exchangeMicrosoftCode(code);
      providerAccountId = getMicrosoftProviderAccountId(tokens);
    } else {
      return redirect(`/settings?error=unknown_provider`);
    }

    // Make sure this OAuth account isn't already linked to a DIFFERENT user
    const existingAccount = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
    if (existingAccount && existingAccount.userId !== userId) {
      return redirect(`/settings?error=account_taken`);
    }

    await prisma.account.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      create: {
        userId,
        type: "oauth",
        provider,
        providerAccountId,
        access_token: tokens.access_token as string,
        refresh_token: (tokens.refresh_token as string | undefined) ?? null,
        expires_at: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + (tokens.expires_in as number)
          : null,
        token_type: (tokens.token_type as string | undefined) ?? null,
        scope: (tokens.scope as string | undefined) ?? null,
        id_token: (tokens.id_token as string | undefined) ?? null,
      },
      update: {
        access_token: tokens.access_token as string,
        refresh_token: (tokens.refresh_token as string | undefined) ?? undefined,
        expires_at: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + (tokens.expires_in as number)
          : undefined,
        scope: (tokens.scope as string | undefined) ?? undefined,
        id_token: (tokens.id_token as string | undefined) ?? null,
      },
    });

    await prisma.linkState.delete({ where: { token: state } });

    return redirect(`/settings?linked=${provider}`);
  } catch (err) {
    console.error("[link/callback] error:", err);
    await prisma.linkState.delete({ where: { token: state } }).catch(() => {});
    return redirect(`/settings?error=link_failed`);
  }
}
