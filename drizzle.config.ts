import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

const isPostgres = !!process.env.POSTGRES_URL;

export default {
  schema: './src/db/schema.ts',
  out: isPostgres ? './drizzle_pg' : './drizzle',
  dialect: isPostgres ? 'postgresql' : 'sqlite',
  dbCredentials: {
    url: process.env.POSTGRES_URL || 'docstore/sqlite3.db',
  },
} satisfies Config;
