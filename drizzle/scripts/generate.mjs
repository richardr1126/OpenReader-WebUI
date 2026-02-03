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

// if (!process.env.POSTGRES_URL) {
//   console.error('[generate] POSTGRES_URL is required to generate postgres migrations.');
//   process.exit(1);
// }

const extraArgs = process.argv.slice(2);

for (const configFile of ['drizzle.config.sqlite.ts', 'drizzle.config.pg.ts']) {
  const result = spawnSync('drizzle-kit', ['generate', '--config', configFile, ...extraArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exit(0);
