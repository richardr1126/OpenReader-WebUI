import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), '.data', '.auth-token');

export function getAuthToken(): string {
  const dir = path.dirname(TOKEN_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  if (existsSync(TOKEN_FILE)) {
    return readFileSync(TOKEN_FILE, 'utf-8').trim();
  }

  const token = randomBytes(32).toString('base64url');
  writeFileSync(TOKEN_FILE, token);
  return token;
}

export function printAuthUrl() {
  const token = getAuthToken();
  const port = process.env.PORT || 3000;
  console.log('\n🔐 Auth URL: http://localhost:' + port + '?token=' + token + '\n');
}
