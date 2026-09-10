import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const source = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

describe('compute-limit route safety', () => {
  test('prevents user-specific status responses from being cached', () => {
    const route = source('src/app/api/compute-limits/status/route.ts');

    expect(route).toContain("'Cache-Control': 'no-store, private'");
    expect(route.match(/headers: NO_STORE_HEADERS/g)).toHaveLength(2);
  });

  test('filters the synthesis admission session before bounding query results', () => {
    const route = source('src/app/api/internal/compute/limits/consume/route.ts');
    const sessionPredicate = route.indexOf('escapeSqlLike(`tts-session:${parsed.sessionId}:`)');
    const resultLimit = route.indexOf('.limit(50)');

    expect(route).toContain('value.replace(/[\\\\%_]/g');
    expect(route).toContain("escape '\\\\'");
    expect(sessionPredicate).toBeGreaterThan(0);
    expect(resultLimit).toBeGreaterThan(sessionPredicate);
  });
});
