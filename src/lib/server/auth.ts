import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { Pool } from "pg";
import { rateLimiter } from "@/lib/server/rate-limiter";
import { isAuthEnabled } from "@/lib/server/auth-config";

const getAuthDatabase = () => {
  if (process.env.POSTGRES_URL) {
    return new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
  }

  // Fallback to SQLite
  // We need to dynamically import or require better-sqlite3 to avoid build issues if it's not used?
  // Actually better-auth supports it directly, we just pass the instance.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Database = require("better-sqlite3");
  const path = require("path");
  const fs = require("fs");
  /* eslint-enable @typescript-eslint/no-require-imports */

  // Ensure directory exists
  const dbPath = path.join(process.cwd(), 'docstore', 'sqlite3.db');
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Database(dbPath);
};

const createAuth = () => betterAuth({
  database: getAuthDatabase(),
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
  advanced: {
    database: {
      generateId: () => {
        // Generate user-friendly IDs similar to current system
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `user-${timestamp}-${random}`;
      },
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