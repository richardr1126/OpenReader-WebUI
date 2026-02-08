import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from "@/db";
import { rateLimiter } from "@/lib/server/rate-limiter";
import { isAuthEnabled } from "@/lib/server/auth-config";
import { transferUserAudiobooks, transferUserDocuments } from "@/lib/server/claim-data";

import * as schema from "@/db/schema"; // Import the dynamic schema

// ...

const createAuth = () => betterAuth({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: drizzleAdapter(db as any, {
    provider: process.env.POSTGRES_URL ? "pg" : "sqlite", // Dynamic provider
    schema: {
      ...schema,
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    }
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3003",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
    async sendResetPassword(data) {
      // Send an email to the user with a link to reset their password
      console.log("Password reset requested for:", data.user.email);
    },
  },
  rateLimit: {
    // Disable rate limiting when running tests to support parallel test workers
    // In production, better-auth's default rate limiting applies
    enabled: process.env.DISABLE_AUTH_RATE_LIMIT !== 'true',
  },
  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      },
    }),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (reasonable for user experience)
    updateAge: 60 * 60 * 1, // 1 hour (refresh more frequently)
    cookieCache: {
      maxAge: 60 * 60 * 24 * 7, // 7 days for cookie cache
    },
  },
  plugins: [
    nextCookies(), // Enable Next.js cookie handling
    anonymous({
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        try {
          // Log when anonymous user links to a real account
          console.log("Anonymous user linked to account:", {
            anonymousUserId: anonymousUser.user.id,
            newUserId: newUser.user.id,
            newUserEmail: newUser.user.email,
          });

          // Transfer rate limiting data (TTS char counts) from anonymous user to authenticated user
          try {
            await rateLimiter.transferAnonymousUsage(anonymousUser.user.id, newUser.user.id);
            console.log(`Successfully transferred rate limit data from anonymous user ${anonymousUser.user.id} to user ${newUser.user.id}`);
          } catch (error) {
            console.error("Error transferring rate limit data during account linking:", error);
            // Don't throw here to prevent blocking the account linking process
          }

          // Transfer audiobooks from anonymous user to new authenticated user
          try {
            const transferred = await transferUserAudiobooks(anonymousUser.user.id, newUser.user.id);
            if (transferred > 0) {
              console.log(`Successfully transferred ${transferred} audiobook(s) from anonymous user ${anonymousUser.user.id} to user ${newUser.user.id}`);
            }
          } catch (error) {
            console.error("Error transferring audiobooks during account linking:", error);
            // Don't throw here to prevent blocking the account linking process
          }

          // Transfer documents from anonymous user to new authenticated user
          try {
            const transferred = await transferUserDocuments(anonymousUser.user.id, newUser.user.id);
            if (transferred > 0) {
              console.log(`Successfully transferred ${transferred} document(s) from anonymous user ${anonymousUser.user.id} to user ${newUser.user.id}`);
            }
          } catch (error) {
            console.error("Error transferring documents during account linking:", error);
            // Don't throw here to prevent blocking the account linking process
          }
        } catch (error) {
          console.error("Error in onLinkAccount callback:", error);
          // Don't throw here to prevent blocking the account linking process
        }
        // Note: Anonymous user will be automatically deleted after this callback completes
      },
    }),
  ],
});

export const auth = isAuthEnabled() ? createAuth() : null;

type AuthInstance = ReturnType<typeof createAuth>;
export type Session = AuthInstance["$Infer"]["Session"];
export type User = AuthInstance["$Infer"]["Session"]["user"];

export type AuthContext = {
  authEnabled: boolean;
  session: Session | null;
  user: User | null;
  userId: string | null;
};

export async function getAuthContext(request: Pick<NextRequest, 'headers'>): Promise<AuthContext> {
  const authEnabled = isAuthEnabled();

  if (!authEnabled || !auth) {
    return { authEnabled, session: null, user: null, userId: null };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  return { authEnabled, session, user, userId };
}

export async function requireAuthContext(
  request: Pick<NextRequest, 'headers'>,
  options?: { requireNonAnonymous?: boolean },
): Promise<AuthContext | Response> {
  const ctx = await getAuthContext(request);

  if (!ctx.authEnabled) {
    return ctx;
  }

  if (!ctx.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (options?.requireNonAnonymous && ctx.user?.isAnonymous) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return ctx;
}
