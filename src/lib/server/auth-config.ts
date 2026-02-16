/**
 * Centralized auth configuration check.
 * Auth is only enabled when BOTH AUTH_SECRET and BASE_URL are set.
 */
export function isAuthEnabled(): boolean {
  return !!(process.env.AUTH_SECRET && process.env.BASE_URL);
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw || raw.trim() === '') return defaultValue;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return defaultValue;
}

/**
 * Anonymous sessions are opt-in.
 * Defaults to false when unset or invalid.
 */
export function isAnonymousAuthSessionsEnabled(): boolean {
  if (!isAuthEnabled()) return false;
  return parseBooleanEnv('USE_ANONYMOUS_AUTH_SESSIONS', false);
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
