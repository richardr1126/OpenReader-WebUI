import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

function loadEnvFiles() {
  // Approximate Next.js behavior enough for server-side scripts.
  // Load .env first, then .env.local (local overrides).
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const envLocalPath = path.join(cwd, '.env.local');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
  }
}

loadEnvFiles();

const authEnabled = Boolean(process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_URL);

if (!authEnabled) {
  // When auth is disabled, the app must not touch sqlite/postgres at all.
  // That includes running migrations which can create/open DB files.
  console.log('[migrate] Skipping (auth disabled). Missing BETTER_AUTH_SECRET and/or BETTER_AUTH_URL.');
  process.exit(0);
}

const extraArgs = process.argv.slice(2);
const result = spawnSync('drizzle-kit', ['migrate', ...extraArgs], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
