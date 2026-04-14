import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyMobileJWT } from "@/lib/mobile-auth";
import { NextRequest } from "next/server";

export interface AppSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

/**
 * Unified session getter that works for both web (NextAuth cookie) and mobile (Bearer JWT).
 * Pass `req` from the route handler to enable Bearer token support.
 */
export async function getAnySession(req?: NextRequest): Promise<AppSession | null> {
  // Try web NextAuth session first (cookie-based)
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return {
      user: {
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name,
      },
    };
  }

  // Try mobile Bearer token
  if (req) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const payload = await verifyMobileJWT(token);
      if (payload?.userId) {
        return {
          user: {
            id: payload.userId,
            email: payload.email,
          },
        };
      }
    }
  }

  return null;
}
