import { Pool } from 'pg';
import path from 'path';
import { DBAdapter, PostgresAdapter, SqliteAdapter } from '@/lib/server/db-adapter';
import { isAuthEnabled } from '@/lib/server/auth-config';

// Singleton instance
let dbInstance: DBAdapter | null = null;

class NoOpAdapter implements DBAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async query(text: string, params?: unknown[]) {
    return { rows: [], rowCount: 0 };
  }

  async transaction<T>(callback: (client: DBAdapter) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

export function getDB(): DBAdapter {
  if (dbInstance) return dbInstance;

  // Avoid creating database connection/file if auth is disabled
  if (!isAuthEnabled()) {
    dbInstance = new NoOpAdapter();
    return dbInstance;
  }

  if (process.env.POSTGRES_URL) {
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
    dbInstance = new PostgresAdapter(pool);
  } else {
    // Fallback to SQLite
    const dbPath = path.join(process.cwd(), 'docstore', 'sqlite3.db');
    console.log(`Using SQLite database at ${dbPath}`);
    dbInstance = new SqliteAdapter(dbPath);
  }

  return dbInstance!;
}

export const db = getDB();
