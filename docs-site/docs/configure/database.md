---
title: Database
---

This page covers database mode selection for OpenReader WebUI.

## Database mode

- SQLite (default): embedded DB at `docstore/sqlite3.db`; good for local/self-host single-instance setups.
- Postgres: enabled when `POSTGRES_URL` is set; recommended for production/distributed deployments.

## What the database stores

- Document and audiobook metadata/state used by server routes.
- Auth/session tables when auth is enabled.
- TTS character usage counters (`user_tts_chars`) for daily rate limiting (when enabled).
- User settings preferences (`user_preferences`) when auth is enabled.
- User reading progress (`user_document_progress`) when auth is enabled.

## Related variables

- `POSTGRES_URL`

For database variable behavior, see [Environment Variables](../reference/environment-variables#database-and-object-blob-storage).

## Related docs

- [Migrations](./migrations)
- [Object / Blob Storage](./object-blob-storage)
- [Auth](./auth)

## State sync summary

- With auth enabled, settings and reading progress are stored in SQL and synced from the app.
- With auth disabled, settings and reading progress remain local in the browser.
- Sync is currently request-based (not realtime push invalidation).
