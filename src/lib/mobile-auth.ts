import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production"
);

export interface MobileTokenPayload {
  userId: string;
  email: string;
}

export async function signMobileJWT(payload: MobileTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifyMobileJWT(token: string): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const { userId, email } = payload as Record<string, unknown>;
    if (typeof userId === "string" && typeof email === "string") {
      return { userId, email };
    }
    return null;
  } catch {
    return null;
  }
}
