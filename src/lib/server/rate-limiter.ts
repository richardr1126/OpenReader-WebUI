import { db } from '@/lib/server/db';
import { isAuthEnabled } from '@/lib/server/auth-config';

// Rate limits configuration - character counts per day
export const RATE_LIMITS = {
  ANONYMOUS: 50_000,    // 50K characters per day for anonymous users
  AUTHENTICATED: 500_000 // 500K characters per day for authenticated users
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

export class RateLimiter {
  constructor() { }

  /**
   * Check if a user can use TTS and increment their char count if allowed
   * @param charCount - Number of characters to add
   */
  async checkAndIncrementLimit(user: UserInfo, charCount: number): Promise<RateLimitResult> {
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

    return db.transaction(async (client) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const limit = user.isAnonymous ? RATE_LIMITS.ANONYMOUS : RATE_LIMITS.AUTHENTICATED;

      // Get or create today's record for this user
      // Postgres supports RETURNING, but SQLite behavior can vary with ON CONFLICT
      // We'll use a standard upsert pattern compatible with both via the adapter logic or simple queries

      // First, ensure record exists
      // SQLite/Postgres compatible UPSERT
      await client.query(`
        INSERT INTO user_tts_chars (user_id, date, char_count)
        VALUES ($1, $2, 0)
        ON CONFLICT (user_id, date)
        DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      `, [user.id, today]);

      // Allow the request that crosses the limit, but block any requests once the user is
      // already at/over the limit. Do this atomically to avoid concurrent over-limit requests.
      const updateResult = await client.query(`
        UPDATE user_tts_chars
        SET char_count = char_count + $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND date = $2 AND char_count < $4
      `, [user.id, today, charCount, limit]);

      // Get current count after the attempted update (works for both success and failure)
      const result = await client.query(`
        SELECT char_count FROM user_tts_chars
        WHERE user_id = $1 AND date = $2
      `, [user.id, today]);

      const currentCount = parseInt(((result.rows[0] as unknown) as DBCharCountRow)?.char_count?.toString() || '0', 10);
      const updated = (updateResult.rowCount ?? 0) > 0;

      if (!updated) {
        return {
          allowed: false,
          currentCount,
          limit,
          resetTime: this.getResetTime(),
          remainingChars: Math.max(0, limit - currentCount)
        };
      }

      return {
        allowed: true,
        currentCount,
        limit,
        resetTime: this.getResetTime(),
        remainingChars: Math.max(0, limit - currentCount)
      };
    });
  }

  /**
   * Get current usage for a user without incrementing
   */
  async getCurrentUsage(user: UserInfo): Promise<RateLimitResult> {
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
    const limit = user.isAnonymous ? RATE_LIMITS.ANONYMOUS : RATE_LIMITS.AUTHENTICATED;

    const result = await db.query(
      'SELECT char_count FROM user_tts_chars WHERE user_id = $1 AND date = $2',
      [user.id, today]
    );

    const currentCount = result.rows.length > 0 ? parseInt(((result.rows[0] as unknown) as DBCharCountRow).char_count.toString(), 10) : 0;

    return {
      allowed: currentCount < limit,
      currentCount,
      limit,
      resetTime: this.getResetTime(),
      remainingChars: Math.max(0, limit - currentCount)
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