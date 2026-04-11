import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Temporary debug endpoint — remove before production */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "microsoft" },
    select: { id: true, providerAccountId: true, expires_at: true, scope: true, access_token: true, refresh_token: true },
  });

  if (!account) return NextResponse.json({ error: "No Microsoft account linked" });

  const nowSeconds = Math.floor(Date.now() / 1000);

  let tokenClaims: Record<string, unknown> = {};
  try {
    if (account.access_token) {
      const parts = account.access_token.split(".");
      if (parts.length === 3) {
        const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        tokenClaims = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
      }
    }
  } catch { /* ignore */ }

  async function graphTest(path: string) {
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      headers: { Authorization: `Bearer ${account!.access_token}` },
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 300) || "(empty body)"; }
    return {
      status: res.status,
      wwwAuthenticate: res.headers.get("WWW-Authenticate") ?? undefined,
      body,
    };
  }

  const now = new Date().toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();

  const [meTest, calendarTest, mailboxTest] = await Promise.all([
    graphTest("/me"),
    graphTest(`/me/calendarView?startDateTime=${now}&endDateTime=${end}&$top=1&$select=id,subject`),
    graphTest("/me/mailboxSettings"),
  ]);

  return NextResponse.json({
    tokenAud: tokenClaims.aud,
    tokenScp: tokenClaims.scp,
    tokenTid: tokenClaims.tid,
    tokenIss: tokenClaims.iss,
    tokenExpired: account.expires_at ? account.expires_at < nowSeconds : null,
    meTest,
    calendarTest,
    mailboxTest,
  });
}
