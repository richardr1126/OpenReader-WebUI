---
title: Database and Migrations
---

This page covers database mode selection and migration behavior for OpenReader WebUI.

## Database mode

- Default mode: embedded SQLite at `docstore/sqlite3.db`
- External mode: Postgres when `POSTGRES_URL` is set

## Startup migration behavior

By default, the shared entrypoint runs migrations automatically before app startup in:

- Docker container startup
- `pnpm dev`
- `pnpm start`

Startup migration phases:

- DB schema migrations (`pnpm migrate`)
- Storage/data migration (`pnpm migrate-fs`) for legacy filesystem content into S3 + DB rows

To skip automatic startup migrations:

- Set `RUN_DRIZZLE_MIGRATIONS=false`
- Set `RUN_FS_MIGRATIONS=false`

Database variables are documented in [Environment Variables](../reference/environment-variables).

## Common project commands

In most cases, you do not need manual migration commands because startup runs migrations automatically.

```bash
# Run pending migrations (uses Postgres config when POSTGRES_URL is set, otherwise SQLite)
pnpm migrate

# Run storage migration (filesystem -> S3 + DB)
pnpm migrate-fs

# Dry-run storage migration without uploading/deleting
pnpm migrate-fs:dry-run

# Generate new migration files for both SQLite and Postgres outputs
pnpm generate
```

## Manual Drizzle commands (advanced)

```bash
# Migrate SQLite
pnpm exec drizzle-kit migrate --config drizzle.config.sqlite.ts

# Migrate Postgres
pnpm exec drizzle-kit migrate --config drizzle.config.pg.ts

# Generate SQLite migrations
pnpm exec drizzle-kit generate --config drizzle.config.sqlite.ts

# Generate Postgres migrations
pnpm exec drizzle-kit generate --config drizzle.config.pg.ts
```
