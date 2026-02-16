import { test, expect } from '@playwright/test';
import { isAnonymousAuthSessionsEnabled } from '../../src/lib/server/auth-config';

const ORIGINAL_BASE_URL = process.env.BASE_URL;
const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_USE_ANON = process.env.USE_ANONYMOUS_AUTH_SESSIONS;

function restoreEnv() {
  if (ORIGINAL_BASE_URL === undefined) delete process.env.BASE_URL;
  else process.env.BASE_URL = ORIGINAL_BASE_URL;

  if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;

  if (ORIGINAL_USE_ANON === undefined) delete process.env.USE_ANONYMOUS_AUTH_SESSIONS;
  else process.env.USE_ANONYMOUS_AUTH_SESSIONS = ORIGINAL_USE_ANON;
}

function setAuthEnabledEnv() {
  process.env.BASE_URL = 'http://localhost:3003';
  process.env.AUTH_SECRET = 'test-secret';
}

test.describe('auth config anonymous-session flag', () => {
  test.afterEach(() => {
    restoreEnv();
  });

  test('returns false when auth is disabled', () => {
    delete process.env.BASE_URL;
    delete process.env.AUTH_SECRET;
    process.env.USE_ANONYMOUS_AUTH_SESSIONS = 'true';

    expect(isAnonymousAuthSessionsEnabled()).toBe(false);
  });

  test('defaults to false when env var is unset', () => {
    setAuthEnabledEnv();
    delete process.env.USE_ANONYMOUS_AUTH_SESSIONS;

    expect(isAnonymousAuthSessionsEnabled()).toBe(false);
  });

  test('returns true only when env var is true', () => {
    setAuthEnabledEnv();
    process.env.USE_ANONYMOUS_AUTH_SESSIONS = 'true';

    expect(isAnonymousAuthSessionsEnabled()).toBe(true);
  });

  test('returns false when env var is false', () => {
    setAuthEnabledEnv();
    process.env.USE_ANONYMOUS_AUTH_SESSIONS = 'false';

    expect(isAnonymousAuthSessionsEnabled()).toBe(false);
  });

  test('falls back to false for invalid values', () => {
    setAuthEnabledEnv();
    process.env.USE_ANONYMOUS_AUTH_SESSIONS = '1';

    expect(isAnonymousAuthSessionsEnabled()).toBe(false);
  });
});
