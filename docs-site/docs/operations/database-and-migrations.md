---
title: SQL Database
---

This page covers database mode selection and migration behavior for OpenReader WebUI.

## Database mode

- Default mode: embedded SQLite at `docstore/sqlite3.db`
- External mode: Postgres when `POSTGRES_URL` is set

## Startup migration behavior

By default, the shared entrypoint runs DB migrations automatically before app startup in:

- Docker container startup
- `pnpm dev`
- `pnpm start`

To skip automatic startup migrations:

- Set `RUN_DB_MIGRATIONS=false`

Database variables are documented in [Environment Variables](../guides/environment-variables).

## Common project commands

In most cases, you do not need manual migration commands because startup runs migrations automatically.

```bash
# Run pending migrations (uses Postgres config when POSTGRES_URL is set, otherwise SQLite)
pnpm migrate

# Generate new migration files for both SQLite and Postgres outputs
pnpm generate
```

## Manual Drizzle commands (advanced)

```bash
# Migrate SQLite
npx drizzle-kit migrate --config drizzle.config.sqlite.ts

# Migrate Postgres
npx drizzle-kit migrate --config drizzle.config.pg.ts

# Generate SQLite migrations
npx drizzle-kit generate --config drizzle.config.sqlite.ts

# Generate Postgres migrations
npx drizzle-kit generate --config drizzle.config.pg.ts
```
