// Session utilities using Dexie for persistence
// Used by auth components for sign-out state tracking

import { updateAppConfig, getAppConfig } from '@/lib/dexie';

/**
 * Check if user was explicitly signed out (for showing appropriate message on signin page)
 */
export async function wasSignedOut(): Promise<boolean> {
  const config = await getAppConfig();
  return config?.signedOut ?? false;
}

/**
 * Clear the signed-out flag after displaying the message
 */
export async function clearSignedOut(): Promise<void> {
  await updateAppConfig({ signedOut: false });
}

/**
 * Mark that the user explicitly signed out
 */
export async function markSignedOut(): Promise<void> {
  await updateAppConfig({ signedOut: true });
}
