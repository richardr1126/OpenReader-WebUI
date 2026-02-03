import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

// Singleton logic not strictly needed if Next.js handles module caching, but good for safety
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any = null;

export function getDrizzleDB() {
  if (dbInstance) return dbInstance;

  if (process.env.POSTGRES_URL) {
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
    dbInstance = drizzlePg(pool, { schema });
  } else {
    // Fallback to SQLite
    const dbPath = path.join(process.cwd(), 'docstore', 'sqlite3.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    dbInstance = drizzleSqlite(sqlite, { schema });
  }

  return dbInstance;
}

export const db = getDrizzleDB();
