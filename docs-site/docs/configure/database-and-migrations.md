---
title: Database and Migrations
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

This page covers database mode selection and migration behavior for OpenReader WebUI.

## Database mode

- SQLite (default): embedded DB at `docstore/sqlite3.db`; good for local/self-host single-instance setups.
- Postgres: enabled when `POSTGRES_URL` is set; recommended for production/distributed deployments.

## Startup migration behavior

By default, the shared entrypoint runs migrations automatically before app startup in:

- Docker container startup
- `pnpm dev`
- `pnpm start`

Startup migration phases:

- DB schema migrations (`pnpm migrate`)
- Storage/data migration (`pnpm migrate-fs`) for legacy filesystem content into S3 + DB rows

:::info
In most setups, you do not need to run migration commands manually because startup handles this automatically.
:::

To skip automatic startup migrations:

- Set `RUN_DRIZZLE_MIGRATIONS=false`
- Set `RUN_FS_MIGRATIONS=false`

Database variables are documented in [Environment Variables](../reference/environment-variables).

## Common project commands

In most cases, you do not need manual migration commands because startup runs migrations automatically.

<Tabs groupId="migration-commands">
  <TabItem value="project-scripts" label="Project Scripts" default>

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

  </TabItem>
  <TabItem value="drizzle-direct" label="Drizzle Direct (Advanced)">

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

  </TabItem>
</Tabs>

:::warning
If you disable startup migrations, ensure your deployment process runs migrations before serving traffic.
:::
