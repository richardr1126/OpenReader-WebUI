import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

// Factory function to create auth client with specific baseUrl
function createAuthClientWithUrl(baseUrl: string) {
  return createAuthClient({
    baseURL: baseUrl,
    plugins: [anonymousClient()],
  });
}

// Cache for auth client instances by baseUrl
const clientCache = new Map<string, ReturnType<typeof createAuthClientWithUrl>>();

export function getAuthClient(baseUrl: string | null) {
  const effectiveUrl = baseUrl || "http://localhost:3003";

  if (!clientCache.has(effectiveUrl)) {
    clientCache.set(effectiveUrl, createAuthClientWithUrl(effectiveUrl));
  }

  return clientCache.get(effectiveUrl)!;
}

// Default client for backwards compatibility (will use localhost in dev)
// Components should prefer useAuth() hook which gets baseUrl from context
export const authClient = getAuthClient(null);

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession
} = authClient;