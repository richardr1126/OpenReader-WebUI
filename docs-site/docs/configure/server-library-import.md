---
title: Server Library Import
---

This page documents how server library import works and how to configure it.

## What it does

Server library import lets you browse files from one or more server directories and import selected files into OpenReader.

- Import is user-driven via a selection modal
- Only selected files are imported
- Imported files become normal OpenReader documents

## Configure library roots

Library roots are resolved from environment variables:

- `IMPORT_LIBRARY_DIRS` (takes precedence): multiple roots separated by comma, colon, or semicolon
- `IMPORT_LIBRARY_DIR`: single root
- Fallback when neither is set: `docstore/library`

See [Environment Variables](../reference/environment-variables#import_library_dir) for details.

## Docker mount example

Mount a host folder to the default library path:

```bash
docker run --name openreader-webui \
  --restart unless-stopped \
  -p 3003:3003 \
  -v openreader_docstore:/app/docstore \
  -v /path/to/your/library:/app/docstore/library:ro \
  ghcr.io/richardr1126/openreader-webui:latest
```

Using `:ro` is recommended so the app treats the library as a read-only source.

## Import flow

1. Open **Settings -> Documents -> Server Library Import**.
2. Select files in the modal.
3. Click **Import**.

Selected files are fetched from the server library endpoint and imported into OpenReader storage.

:::warning Shared Library Roots
Library roots are configured at the server level (not per-user). Any user who can access Server Library Import can browse/import from the same configured roots.

Imported documents are still saved to the importing user's document scope.
:::

## Supported file types

- `.pdf`
- `.epub`
- `.html`, `.htm`
- `.txt`
- `.md`, `.mdown`, `.markdown`

## Notes

- Library listing is capped per request (up to 10,000 files).
- When auth is enabled, library import endpoints require a valid session.
- The mounted library is a source; removing it does not delete already imported documents.
