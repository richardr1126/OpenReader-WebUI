---
title: Auth
---

This page covers application-level configuration for provider access and authentication.

## Auth behavior

- Auth is enabled only when both `BASE_URL` and `AUTH_SECRET` are set.
- Remove either value to disable auth.
- Keep `AUTH_TRUSTED_ORIGINS` empty to trust only `BASE_URL`.

## Related docs

- For the complete variable reference: [Environment Variables](../reference/environment-variables)
- For TTS character limits and quota behavior: [TTS Rate Limiting](./tts-rate-limiting)
- For provider-specific guidance: [TTS Providers](./tts-providers)
- For storage/S3/SeaweedFS behavior: [Object / Blob Storage](./object-blob-storage)
- For database mode and migration commands: [Database and Migrations](./database-and-migrations)
