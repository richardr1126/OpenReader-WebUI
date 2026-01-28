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

/**
 * Factory function to get auth client with specific baseUrl.
 * In components, prefer reading `baseUrl` from `useAuthConfig()` and then calling `getAuthClient(baseUrl)`.
 * @param baseUrl - The auth server base URL. If null, will throw an error.
 */
export function getAuthClient(baseUrl: string | null) {
  if (!baseUrl) {
    throw new Error(
      'Cannot create auth client without baseUrl. ' +
      'Use useAuthConfig() in components to get the properly configured baseUrl.'
    );
  }

  if (!clientCache.has(baseUrl)) {
    clientCache.set(baseUrl, createAuthClientWithUrl(baseUrl));
  }

  return clientCache.get(baseUrl)!;
}
