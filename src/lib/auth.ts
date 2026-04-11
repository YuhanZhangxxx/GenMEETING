import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { Adapter } from "next-auth/adapters";

// Custom Microsoft provider using the common endpoint (supports personal + org accounts)
function MicrosoftProvider(
  options: OAuthUserConfig<Record<string, string>> & { tenantId: string }
): OAuthConfig<Record<string, string>> {
  return {
    id: "microsoft",
    name: "Microsoft",
    type: "oauth",
    wellKnown: `https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope:
          "openid profile email offline_access https://graph.microsoft.com/Calendars.ReadWrite",
      },
    },
    idToken: true,
    checks: ["pkce", "state"],
    client: { token_endpoint_auth_method: "client_secret_post" },
    profile(profile) {
      return {
        id: profile.sub ?? profile.oid,
        name: profile.name,
        email: profile.email ?? profile.preferred_username,
        image: null,
      };
    },
    clientId: options.clientId,
    clientSecret: options.clientSecret,
  };
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
    MicrosoftProvider({
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.MICROSOFT_TENANT_ID!,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
  pages: { signIn: "/login" },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
