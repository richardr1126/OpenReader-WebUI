import { Pool, PoolClient } from "pg";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Common interface for database operations to support both Postgres and SQLite
 */
export interface DBAdapter {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[], rowCount?: number }>;
  transaction<T>(callback: (client: DBAdapter) => Promise<T>): Promise<T>;
}

export class PostgresAdapter implements DBAdapter {
  constructor(private pool: Pool) { }

  async query(text: string, params?: unknown[]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await this.pool.query(text, params as any[]);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? undefined
      };
    } catch (error) {
      console.error("Postgres Query Error:", error);
      throw error;
    }
  }

  async transaction<T>(callback: (client: DBAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const connectedAdapter = new PostgresConnectedAdapter(client);
      const result = await callback(connectedAdapter);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

class PostgresConnectedAdapter implements DBAdapter {
  constructor(private client: PoolClient) { }

  async query(text: string, params?: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.client.query(text, params as any[]);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? undefined
    };
  }

  async transaction<T>(callback: (client: DBAdapter) => Promise<T>): Promise<T> {
    // Nested transactions not explicitly supported, just pass through
    return callback(this);
  }
}

export class SqliteAdapter implements DBAdapter {
  private db: Database.Database;

  constructor(filePath: string) {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory for SQLite: ${dir}`);
      } catch (e) {
        console.error(`Failed to create directory ${dir}:`, e);
      }
    }

    this.db = new Database(filePath);
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
  }

  async query(text: string, params?: unknown[]) {
    // simple heuristic to convert Postgres $n params to SQLite ?
    // This assumes we aren't using $n inside string literals.
    const convertedSql = text.replace(/\$\d+/g, "?");

    try {
      const stmt = this.db.prepare(convertedSql);
      const safeParams = params || [];

      const lowerSql = convertedSql.trim().toLowerCase();

      // If it's a SELECT or RETURNING, we use .all() or .get()
      if (lowerSql.startsWith("select") || /returning\s+/.test(lowerSql)) {
        const rows = stmt.all(...safeParams);
        return { rows, rowCount: rows.length };
      } else {
        // INSERT/UPDATE/DELETE with no RETURNING
        const info = stmt.run(...safeParams);
        return { rows: [], rowCount: info.changes };
      }
    } catch (error) {
      console.error("SQLite Query Error:", error);
      throw error;
    }
  }

  async transaction<T>(callback: (client: DBAdapter) => Promise<T>): Promise<T> {
    // Manual transaction management
    // better-sqlite3 is synchronous, but we simulate async interface
    this.db.exec("BEGIN");
    try {
      const result = await callback(this);
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
