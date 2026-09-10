import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';

describe('unified compute-limit migration', () => {
  test('retires legacy settings and usage tables and resets the superseded policy shape', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE user (id text PRIMARY KEY);
      CREATE TABLE admin_settings (
        key text PRIMARY KEY NOT NULL,
        value_json text NOT NULL,
        source text NOT NULL DEFAULT 'admin',
        updated_at integer NOT NULL DEFAULT 0
      );
      CREATE TABLE scheduled_tasks (key text PRIMARY KEY);
      CREATE TABLE user_job_events (id text);
      CREATE TABLE user_tts_chars (id text);
    `);
    const insert = sqlite.prepare(
      'INSERT INTO admin_settings (key, value_json, source, updated_at) VALUES (?, ?, ?, 1)',
    );
    const legacy: Record<string, boolean | number> = {
      disableTtsRateLimit: false,
      ttsDailyLimitAnonymous: 12345,
      ttsDailyLimitAuthenticated: 23456,
      ttsIpDailyLimitAnonymous: 34567,
      ttsIpDailyLimitAuthenticated: 45678,
      disableComputeRateLimit: false,
      computeParseBurstMax: 3,
      computeParseBurstWindowSec: 45,
      computeParseSustainedMax: 9,
      computeParseSustainedWindowSec: 450,
    };
    for (const [key, value] of Object.entries(legacy)) {
      insert.run(key, JSON.stringify(value), 'admin');
    }

    for (const migrationName of [
      '0017_unified_compute_limits.sql',
      '0018_persist_admission_active_scopes.sql',
      '0019_reset_compute_limit_policy.sql',
    ]) {
      const migration = fs.readFileSync(path.resolve(
        'packages/database/migrations/sqlite',
        migrationName,
      ), 'utf8').replaceAll('--> statement-breakpoint', '');
      sqlite.exec(migration);
    }

    expect(sqlite.prepare(
      "SELECT count(*) AS count FROM admin_settings WHERE key = 'computeLimitPolicies'",
    ).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(
      "SELECT count(*) AS count FROM admin_settings WHERE key = 'disableTtsRateLimit'",
    ).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('user_job_events', 'user_tts_chars')",
    ).get()).toEqual({ count: 0 });
    expect(sqlite.prepare(
      "SELECT name, \"notnull\" AS required, dflt_value AS defaultValue FROM pragma_table_info('compute_limit_admissions') WHERE name = 'active_scopes_json'",
    ).get()).toEqual({ name: 'active_scopes_json', required: 1, defaultValue: "'[]'" });
    sqlite.close();
  });
});
