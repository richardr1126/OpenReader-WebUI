import { db } from '@/lib/server/db';
import { isAuthEnabled } from '@/lib/server/auth-config';

// Rate limits configuration - character counts per day
export const RATE_LIMITS = {
  ANONYMOUS: 50_000,    // 50K characters per day for anonymous users
  AUTHENTICATED: 500_000, // 500K characters per day for authenticated users
  // IP-based backstop limits to make it harder to reset limits by creating new accounts
  // or clearing storage/cookies. These are intentionally conservative defaults and can
  // be tuned via env vars.
  IP_ANONYMOUS: Number(process.env.TTS_IP_DAILY_LIMIT_ANONYMOUS || 100_000),
  IP_AUTHENTICATED: Number(process.env.TTS_IP_DAILY_LIMIT_AUTHENTICATED || 1_000_000),
} as const;

// Singleton flag to ensure we only initialize the table once per process
let tableInitialized: Promise<void> | null = null;

// Initialize rate limiting table (cached, runs only once per process)
export async function initializeRateLimitTable() {
  if (tableInitialized) {
    return tableInitialized;
  }

  tableInitialized = (async () => {
    // Use transaction to ensure safe initialization
    await db.transaction(async (client) => {
      // Check if table exists first to avoid errors on some DBs
      // Simple create table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_tts_chars (
          user_id VARCHAR(255) NOT NULL,
          date DATE NOT NULL,
          char_count BIGINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, date)
        )
      `);

      // Create index for faster queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_tts_chars_date ON user_tts_chars(date)
      `);
    });
    console.log('Rate limit table initialized');
  })();

  return tableInitialized;
}

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetTime: Date;
  remainingChars: number;
}

interface DBCharCountRow {
  char_count: string | number;
}

export interface UserInfo {
  id: string;
  isAnonymous?: boolean;
  isPro?: boolean;
}

export interface RateLimitBackstops {
  /** Stable device identifier cookie value (server-issued). */
  deviceId?: string | null;
  /** Best-effort client IP (from proxy headers). */
  ip?: string | null;
}

type Bucket = {
  key: string;
  limit: number;
};

function normalizeBackstopKey(prefix: string, value: string): string {
  // Keep the key reasonably bounded; prevent extremely long identifiers from bloating DB.
  const trimmed = value.trim();
  const safe = trimmed.length > 128 ? trimmed.slice(0, 128) : trimmed;
  return `${prefix}:${safe}`;
}

function pickEffectiveResult(results: Array<{ currentCount: number; limit: number }>): {
  currentCount: number;
  limit: number;
  remainingChars: number;
  allowed: boolean;
} {
  if (results.length === 0) {
    return {
      allowed: true,
      currentCount: 0,
      limit: Number.MAX_SAFE_INTEGER,
      remainingChars: Number.MAX_SAFE_INTEGER,
    };
  }

  let binding = results[0];
  let bindingRemaining = Math.max(0, binding.limit - binding.currentCount);

  for (const r of results) {
    const remaining = Math.max(0, r.limit - r.currentCount);
    if (remaining < bindingRemaining) {
      binding = r;
      bindingRemaining = remaining;
    }
  }

  return {
    allowed: results.every(r => r.currentCount < r.limit),
    currentCount: binding.currentCount,
    limit: binding.limit,
    remainingChars: bindingRemaining,
  };
}

class RateLimitExceeded extends Error {
  name = 'RateLimitExceeded' as const;
}

export class RateLimiter {
  constructor() { }

  /**
   * Check if a user can use TTS and increment their char count if allowed
   * @param charCount - Number of characters to add
   */
  async checkAndIncrementLimit(user: UserInfo, charCount: number, backstops?: RateLimitBackstops): Promise<RateLimitResult> {
    // If auth is not enabled, always allow
    if (!isAuthEnabled()) {
      return {
        allowed: true,
        currentCount: 0,
        limit: Number.MAX_SAFE_INTEGER,
        resetTime: this.getResetTime(),
        remainingChars: Number.MAX_SAFE_INTEGER
      };
    }

    await initializeRateLimitTable();

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const userLimit = user.isAnonymous ? RATE_LIMITS.ANONYMOUS : RATE_LIMITS.AUTHENTICATED;

    const buckets: Bucket[] = [{ key: user.id, limit: userLimit }];

    const deviceId = backstops?.deviceId?.toString() || null;
    const ip = backstops?.ip?.toString() || null;

    if (user.isAnonymous && deviceId) {
      buckets.push({ key: normalizeBackstopKey('device', deviceId), limit: RATE_LIMITS.ANONYMOUS });
    }

    if (ip) {
      buckets.push({
        key: normalizeBackstopKey('ip', ip),
        limit: user.isAnonymous ? RATE_LIMITS.IP_ANONYMOUS : RATE_LIMITS.IP_AUTHENTICATED,
      });
    }

    try {
      return await db.transaction(async (client) => {
        // Ensure records exist for each bucket
        for (const bucket of buckets) {
          await client.query(`
            INSERT INTO user_tts_chars (user_id, date, char_count)
            VALUES ($1, $2, 0)
            ON CONFLICT (user_id, date)
            DO UPDATE SET updated_at = CURRENT_TIMESTAMP
          `, [bucket.key, today]);
        }

        // Attempt to increment each bucket. If any bucket is already at/over the limit,
        // throw to force a transaction rollback (no partial increments).
        for (const bucket of buckets) {
          const updateResult = await client.query(`
            UPDATE user_tts_chars
            SET char_count = char_count + $3, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND date = $2 AND char_count < $4
          `, [bucket.key, today, charCount, bucket.limit]);

          const updated = (updateResult.rowCount ?? 0) > 0;
          if (!updated) {
            throw new RateLimitExceeded();
          }
        }

        // Fetch current counts for all buckets after increment
        const bucketResults: Array<{ currentCount: number; limit: number }> = [];
        for (const bucket of buckets) {
          const result = await client.query(`
            SELECT char_count FROM user_tts_chars
            WHERE user_id = $1 AND date = $2
          `, [bucket.key, today]);

          const currentCount = parseInt(((result.rows[0] as unknown) as DBCharCountRow)?.char_count?.toString() || '0', 10);
          bucketResults.push({ currentCount, limit: bucket.limit });
        }

        const effective = pickEffectiveResult(bucketResults);

        return {
          allowed: true,
          currentCount: effective.currentCount,
          limit: effective.limit,
          resetTime: this.getResetTime(),
          remainingChars: effective.remainingChars,
        };
      });
    } catch (error) {
      if (error instanceof RateLimitExceeded) {
        const current = await this.getCurrentUsage(user, backstops);
        return { ...current, allowed: false };
      }
      throw error;
    }
  }

  /**
   * Get current usage for a user without incrementing
   */
  async getCurrentUsage(user: UserInfo, backstops?: RateLimitBackstops): Promise<RateLimitResult> {
    // If auth is not enabled, return unlimited
    if (!isAuthEnabled()) {
      return {
        allowed: true,
        currentCount: 0,
        limit: Number.MAX_SAFE_INTEGER,
        resetTime: this.getResetTime(),
        remainingChars: Number.MAX_SAFE_INTEGER
      };
    }

    await initializeRateLimitTable();

    const today = new Date().toISOString().split('T')[0];
    const userLimit = user.isAnonymous ? RATE_LIMITS.ANONYMOUS : RATE_LIMITS.AUTHENTICATED;

    const buckets: Bucket[] = [{ key: user.id, limit: userLimit }];

    const deviceId = backstops?.deviceId?.toString() || null;
    const ip = backstops?.ip?.toString() || null;

    if (user.isAnonymous && deviceId) {
      buckets.push({ key: normalizeBackstopKey('device', deviceId), limit: RATE_LIMITS.ANONYMOUS });
    }

    if (ip) {
      buckets.push({
        key: normalizeBackstopKey('ip', ip),
        limit: user.isAnonymous ? RATE_LIMITS.IP_ANONYMOUS : RATE_LIMITS.IP_AUTHENTICATED,
      });
    }

    const bucketResults: Array<{ currentCount: number; limit: number }> = [];
    for (const bucket of buckets) {
      const result = await db.query(
        'SELECT char_count FROM user_tts_chars WHERE user_id = $1 AND date = $2',
        [bucket.key, today]
      );
      const currentCount = result.rows.length > 0
        ? parseInt(((result.rows[0] as unknown) as DBCharCountRow).char_count.toString(), 10)
        : 0;
      bucketResults.push({ currentCount, limit: bucket.limit });
    }

    const effective = pickEffectiveResult(bucketResults);

    return {
      allowed: effective.allowed,
      currentCount: effective.currentCount,
      limit: effective.limit,
      resetTime: this.getResetTime(),
      remainingChars: effective.remainingChars,
    };
  }

  /**
   * Transfer char counts when anonymous user creates an account
   */
  async transferAnonymousUsage(anonymousUserId: string, authenticatedUserId: string): Promise<void> {
    if (!isAuthEnabled()) return;

    await initializeRateLimitTable();

    await db.transaction(async (client) => {
      const today = new Date().toISOString().split('T')[0];

      // Get anonymous user's current count
      const anonymousResult = await client.query(
        'SELECT char_count FROM user_tts_chars WHERE user_id = $1 AND date = $2',
        [anonymousUserId, today]
      );

      if (anonymousResult.rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anonymousCount = parseInt((anonymousResult.rows[0] as any).char_count, 10);

        // Update or create record for authenticated user
        await client.query(`
          INSERT INTO user_tts_chars (user_id, date, char_count)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, date)
          DO UPDATE SET 
            char_count = CASE 
              WHEN user_tts_chars.char_count > $3 THEN user_tts_chars.char_count 
              ELSE $3 
            END,
            updated_at = CURRENT_TIMESTAMP
        `, [authenticatedUserId, today, anonymousCount]);

        // Remove anonymous user's record
        await client.query(
          'DELETE FROM user_tts_chars WHERE user_id = $1 AND date = $2',
          [anonymousUserId, today]
        );
      }
    });
  }

  /**
   * Clean up old records (optional maintenance)
   */
  async cleanupOldRecords(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    await db.query(
      'DELETE FROM user_tts_chars WHERE date < $1',
      [cutoffDateStr]
    );
  }

  private getResetTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0); // Start of next day in UTC
    return tomorrow;
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();