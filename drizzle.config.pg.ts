import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.POSTGRES_URL;
if (!url) {
  throw new Error('POSTGRES_URL is required for drizzle.config.pg.ts');
}

export default {
  schema: './src/db/schema_postgres.ts',
  out: './drizzle/postgres',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
} satisfies Config;
