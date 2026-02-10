/**
 * Centralized auth configuration check.
 * Auth is only enabled when BOTH AUTH_SECRET and BASE_URL are set.
 */
export function isAuthEnabled(): boolean {
  return !!(process.env.AUTH_SECRET && process.env.BASE_URL);
}

/**
 * Get the auth base URL if auth is enabled, otherwise null.
 */
export function getAuthBaseUrl(): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  return process.env.BASE_URL || null;
}
