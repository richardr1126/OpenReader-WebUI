/**
 * Centralized auth configuration check.
 * Auth is only enabled when BOTH BETTER_AUTH_SECRET and BETTER_AUTH_URL are set.
 */
export function isAuthEnabled(): boolean {
  return !!(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);
}

/**
 * Get the auth base URL if auth is enabled, otherwise null.
 */
export function getAuthBaseUrl(): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  return process.env.BETTER_AUTH_URL || null;
}
