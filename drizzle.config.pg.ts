import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

let url = process.env.POSTGRES_URL;
if (!url) {
  //throw new Error('POSTGRES_URL is required for drizzle.config.pg.ts');
  console.warn('[drizzle.config.pg.ts] POSTGRES_URL is not set; using a placeholder URL.');
  url = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
}

export default {
  schema: './src/db/schema_postgres.ts',
  out: './drizzle/postgres',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
} satisfies Config;
