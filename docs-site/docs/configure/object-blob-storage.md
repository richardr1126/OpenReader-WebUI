---
title: Object / Blob Storage
---

This page documents storage backends, blob upload routing, and core Docker mount behavior.

## Storage backends

- Embedded (default): SQLite metadata + embedded SeaweedFS (`weed mini`) blobs.
- External: Postgres + external S3-compatible object storage.

Storage variables are documented in [Environment Variables](../reference/environment-variables) under the storage sections.

## Ports

- `3003`: OpenReader app and API routes
- `8333`: Embedded SeaweedFS S3 endpoint for direct browser blob access

:::info
`8333` is only needed for direct browser presigned access to embedded SeaweedFS.
:::

## Upload behavior

- Primary path: browser uploads to presigned URL from `/api/documents/blob/upload/presign`.
- Fallback path: `/api/documents/blob/upload/fallback` when direct upload fails/unreachable.
- Read/download path: blob/content serving route `/api/documents/blob` (not the upload fallback route).

## Recommended Docker mounts

| Mount | Type | Recommended | Purpose | Example |
| --- | --- | --- | --- | --- |
| `/app/docstore` | Docker named volume | Yes (for persistence) | Persists SeaweedFS blob data, SQLite metadata DB, migrations, and local runtime temp state | `-v openreader_docstore:/app/docstore` |

For server library mounts/import behavior, see [Server Library Import](./server-library-import).

## Private blob endpoint mode

If `8333` is not published externally:

- Document uploads still work through upload fallback proxy
- Reads/snippets continue through app API routes
- Direct presigned browser upload/download to embedded endpoint is unavailable

:::warning
Without `8333`, expect higher app-server traffic because uploads/downloads go through API routes instead of direct object endpoint access.
:::

## Audiobook storage note

- In current versions, audiobook assets live in object storage (`audiobooks_v1` keyspace), not as durable files under `/app/docstore`.
- Local filesystem usage for audiobook routes is temporary processing only.
