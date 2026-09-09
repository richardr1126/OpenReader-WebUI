import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cloneComputeLimitPolicyDocument,
  type ComputeLimitPolicyDocument,
} from '@openreader/runtime-config/compute-limits';

const databaseDirectory = mkdtempSync(join(tmpdir(), 'openreader-compute-limit-test-'));
const databasePath = join(databaseDirectory, 'limits.db');
let consumeComputeUsage: typeof import('@/lib/server/compute-limits/usage').consumeComputeUsage;
let reserveComputeAdmission: typeof import('@/lib/server/compute-limits/admission').reserveComputeAdmission;
let finishComputeAdmission: typeof import('@/lib/server/compute-limits/admission').finishComputeAdmission;

function policy(boundary: 'strict' | 'soft_unit'): ComputeLimitPolicyDocument {
  const value = cloneComputeLimitPolicyDocument();
  value.actions.tts_synthesis.mode = 'enforce';
  value.actions.tts_synthesis.usage = [{
    scope: 'user',
    audience: 'authenticated',
    metric: 'characters',
    window: 'utc_day',
    limit: 10,
    boundary,
  }];
  return value;
}

beforeAll(async () => {
  process.env.SQLITE_DB_PATH = databasePath;
  process.env.AUTH_SECRET = 'compute-limit-test-secret';
  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    create table user (id text primary key);
    insert into user (id) values ('user-1');
    create table compute_limit_admissions (
      id text primary key,
      request_key text not null,
      user_id text not null references user(id) on delete cascade,
      is_anonymous integer not null,
      action text not null,
      state text not null,
      operation_id text,
      device_scope_key text,
      ip_scope_key text,
      policy_version integer not null,
      created_at integer not null,
      activated_at integer,
      finished_at integer,
      lease_expires_at integer not null,
      unique (user_id, action, request_key)
    );
    create table compute_limit_buckets (
      scope_type text not null,
      scope_key text not null,
      action text not null,
      metric text not null,
      window_start integer not null,
      window_end integer not null,
      used integer not null default 0,
      updated_at integer not null,
      primary key (scope_type, scope_key, action, metric, window_start)
    );
    create table compute_limit_events (
      event_key text primary key,
      admission_id text references compute_limit_admissions(id) on delete set null,
      user_id text not null references user(id) on delete cascade,
      action text not null,
      metric text not null,
      units integer not null,
      policy_version integer not null,
      created_at integer not null
    );
  `);
  sqlite.close();
  vi.resetModules();
  ({ consumeComputeUsage } = await import('@/lib/server/compute-limits/usage'));
  ({ reserveComputeAdmission, finishComputeAdmission } = await import('@/lib/server/compute-limits/admission'));
});

afterAll(() => {
  rmSync(databaseDirectory, { recursive: true, force: true });
});

describe('compute usage limits', () => {
  const subject = { userId: 'user-1', isAnonymous: false };
  const nowMs = Date.UTC(2026, 8, 8, 12);

  test('soft segment thresholds admit one complete overshooting segment, then stop', async () => {
    const first = await consumeComputeUsage({
      policy: policy('soft_unit'), action: 'tts_synthesis', metric: 'characters',
      units: 8, eventKey: 'soft-1', subject, nowMs,
    });
    const overshoot = await consumeComputeUsage({
      policy: policy('soft_unit'), action: 'tts_synthesis', metric: 'characters',
      units: 8, eventKey: 'soft-2', subject, nowMs,
    });
    const denied = await consumeComputeUsage({
      policy: policy('soft_unit'), action: 'tts_synthesis', metric: 'characters',
      units: 1, eventKey: 'soft-3', subject, nowMs,
    });
    const retry = await consumeComputeUsage({
      policy: policy('soft_unit'), action: 'tts_synthesis', metric: 'characters',
      units: 8, eventKey: 'soft-2', subject, nowMs,
    });

    expect(first).toMatchObject({ allowed: true, charged: true, idempotent: false });
    expect(overshoot).toMatchObject({ allowed: true, charged: true, idempotent: false });
    expect(overshoot.buckets[0]?.used).toBe(16);
    expect(denied).toMatchObject({ allowed: false, charged: false });
    expect(denied.buckets[0]?.used).toBe(16);
    expect(retry).toMatchObject({ allowed: true, charged: false, idempotent: true });
  });

  test('strict boundaries reject a unit that would cross the cap', async () => {
    const strictNowMs = nowMs + 24 * 60 * 60 * 1000;
    const first = await consumeComputeUsage({
      policy: policy('strict'), action: 'tts_synthesis', metric: 'characters',
      units: 8, eventKey: 'strict-1', subject, nowMs: strictNowMs,
    });
    const denied = await consumeComputeUsage({
      policy: policy('strict'), action: 'tts_synthesis', metric: 'characters',
      units: 3, eventKey: 'strict-2', subject, nowMs: strictNowMs,
    });

    expect(first.allowed).toBe(true);
    expect(denied).toMatchObject({ allowed: false, charged: false });
    expect(denied.buckets[0]?.used).toBe(8);
  });
});

describe('compute admission limits', () => {
  test('atomically admits only one active job and releases its gauge', async () => {
    const admissionPolicy = cloneComputeLimitPolicyDocument();
    admissionPolicy.actions.pdf_layout.mode = 'enforce';
    admissionPolicy.actions.pdf_layout.admission.windows = [];
    admissionPolicy.actions.pdf_layout.admission.active = [
      { scope: 'user', limit: 1, leaseSeconds: 60 },
    ];
    const subject = { userId: 'user-1', isAnonymous: false };
    const [first, second] = await Promise.all([
      reserveComputeAdmission({
        policy: admissionPolicy, action: 'pdf_layout', requestKey: 'pdf-1', subject,
      }),
      reserveComputeAdmission({
        policy: admissionPolicy, action: 'pdf_layout', requestKey: 'pdf-2', subject,
      }),
    ]);
    const admitted = [first, second].filter((decision) => decision.allowed);
    const denied = [first, second].filter((decision) => !decision.allowed);

    expect(admitted).toHaveLength(1);
    expect(denied).toHaveLength(1);
    await finishComputeAdmission({ admissionId: admitted[0]!.admissionId!, state: 'finished' });
    await expect(reserveComputeAdmission({
      policy: admissionPolicy, action: 'pdf_layout', requestKey: 'pdf-3', subject,
    })).resolves.toMatchObject({ allowed: true });
  });
});
