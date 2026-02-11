---
title: Vercel Deployment
---

This guide covers deploying OpenReader WebUI to Vercel with external Postgres and S3-compatible object storage.

## What works on Vercel

- Documents (PDF/EPUB/TXT/MD) work with `POSTGRES_URL` + external S3 storage.
- Audiobook routes work on Node.js serverless functions using `ffmpeg-static`/`ffprobe-static`.
- `docx` conversion requires `soffice` (LibreOffice), which is not available in a standard Vercel runtime.

## 1. Required environment variables

Set these in your Vercel project:

```bash
POSTGRES_URL=postgres://...
USE_EMBEDDED_WEED_MINI=false
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=...
S3_REGION=us-east-1
S3_ENDPOINT=https://...
S3_FORCE_PATH_STYLE=true
S3_PREFIX=openreader
```

Optional but common:

```bash
BASE_URL=https://your-app.vercel.app
AUTH_SECRET=...
NEXT_PUBLIC_NODE_ENV=production
NEXT_PUBLIC_ENABLE_AUDIOBOOK_EXPORT=true
NEXT_PUBLIC_ENABLE_WORD_HIGHLIGHT=true
```

For all variables and defaults, see [Environment Variables](../reference/environment-variables).

## 2. FFmpeg/ffprobe packaging in Vercel functions

`ffmpeg-static` and `ffprobe-static` binaries must be included in function traces. This repo already does that in `next.config.ts` via `outputFileTracingIncludes` for:

- `/api/audiobook(.*)`
- `/api/whisper`

If you change route paths or split handlers, update `outputFileTracingIncludes` accordingly.

## 3. Function memory sizing

FFmpeg workloads benefit from more memory/CPU. This repo includes:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "app/api/audiobook/route.ts": { "memory": 3009 },
    "app/api/whisper/route.ts": { "memory": 3009 }
  }
}
```

Adjust memory per route if your files are larger or your plan differs.

## 4. Runtime expectations and caveats

- Audiobook APIs require S3 configuration; otherwise they return `503`.
- `better-sqlite3` remains in `serverExternalPackages` for mixed/self-host setups, but production Vercel should use `POSTGRES_URL`.
- Filesystem-to-object-store migrations run via server scripts/entrypoint (`scripts/migrate-fs-v2.mjs`), not API routes.
- Vercel deployments do not run `scripts/openreader-entrypoint.mjs`, so run `pnpm migrate-fs` in a controlled environment when migrating legacy filesystem data.

## 5. Smoke test after deploy

1. Upload and read a PDF/EPUB document.
2. Confirm sync/blob fetch works across refreshes/devices.
3. Generate at least one audiobook chapter and play/download it.
4. If using word highlighting, verify timestamps are produced and rendered.
