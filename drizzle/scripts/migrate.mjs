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

const extraArgs = process.argv.slice(2);

const hasConfigArg = extraArgs.includes('--config');
const configFile = process.env.POSTGRES_URL ? 'drizzle.config.pg.ts' : 'drizzle.config.sqlite.ts';
const configArgs = hasConfigArg ? [] : ['--config', configFile];

const result = spawnSync('drizzle-kit', ['migrate', ...configArgs, ...extraArgs], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
