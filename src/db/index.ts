import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';
import * as authSchemaSqlite from './schema_auth_sqlite';
import * as authSchemaPostgres from './schema_auth_postgres';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any = null;

function getDrizzleDB() {
  if (dbInstance) return dbInstance;

  if (process.env.POSTGRES_URL) {
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
    });
    dbInstance = drizzlePg(pool, { schema: { ...schema, ...authSchemaPostgres } });
  } else {
    // Fallback to SQLite
    const dbPath = path.join(process.cwd(), 'docstore', 'sqlite3.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    dbInstance = drizzleSqlite(sqlite, { schema: { ...schema, ...authSchemaSqlite } });
  }

  return dbInstance;
}

// Lazy proxy: the actual DB connection is only opened on first property access.
// This prevents side effects (e.g. creating an empty sqlite3.db) when modules
// import `db` but never use it, such as during Better Auth CLI schema generation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy({} as any, {
  get(_target, prop, receiver) {
    const instance = getDrizzleDB();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
