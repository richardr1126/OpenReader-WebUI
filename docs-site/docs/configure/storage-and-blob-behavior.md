---
title: Object / Blob Storage
---

This page documents storage backends, blob upload routing, and Docker mount behavior.

## Storage backends

- Default: embedded SQLite metadata + embedded SeaweedFS (`weed mini`) blobs
- External option: Postgres + external S3-compatible object storage

Storage variables are documented in [Environment Variables](../reference/environment-variables) under the storage sections.

## Ports

- `3003`: OpenReader app and API routes
- `8333`: Embedded SeaweedFS S3 endpoint for direct browser blob access

## Upload behavior

- Primary path: browser uploads to presigned URL from `/api/documents/blob/upload/presign`
- Fallback path: `/api/documents/blob/upload/fallback` if direct upload fails or endpoint is unreachable
- Content serving path: `/api/documents/blob`

## Recommended Docker mounts

| Mount | Type | Recommended | Purpose | Example |
| --- | --- | --- | --- | --- |
| `/app/docstore` | Docker named volume | Yes (for persistence) | Persists SeaweedFS blob data, SQLite metadata DB, migrations, and local runtime temp state | `-v openreader_docstore:/app/docstore` |
| `/app/docstore/library` | Bind mount | Optional + `:ro` | Read-only source for server library import (files are copied/imported into client storage) | `-v /path/to/your/library:/app/docstore/library:ro` |

To import from mounted library: **Settings -> Documents -> Server Library Import**.

:::note
Every file in the mounted library is imported into client browser storage. Keep the library reasonably sized.
:::

## Private blob endpoint mode

If `8333` is not published externally:

- Document uploads still work through upload fallback proxy
- Reads/snippets continue through app API routes
- Direct presigned browser upload/download to embedded endpoint is unavailable

## Audiobook storage note

- In current versions, audiobook assets live in object storage (`audiobooks_v1` keyspace), not as durable files under `/app/docstore`.
- Local filesystem usage for audiobook routes is temporary processing only.
