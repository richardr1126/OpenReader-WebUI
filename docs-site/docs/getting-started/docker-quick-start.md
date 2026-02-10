---
title: Docker Quick Start
---

## Prerequisites

- A recent Docker version installed
- A TTS API server that OpenReader can reach (Kokoro-FastAPI, Orpheus-FastAPI, DeepInfra, OpenAI, or equivalent)

:::note
If you have suitable hardware, you can run Kokoro locally with Docker. See [Kokoro-FastAPI](../integrations/kokoro-fastapi).
:::

## 1. Start the Docker container

Minimal setup (auth disabled, embedded storage ephemeral, no library import):

```bash
docker run --name openreader-webui \
  --restart unless-stopped \
  -p 3003:3003 \
  -p 8333:8333 \
  ghcr.io/richardr1126/openreader-webui:latest
```

Fully featured setup (persistent storage, embedded SeaweedFS `weed mini`, optional auth):

```bash
docker run --name openreader-webui \
  --restart unless-stopped \
  -p 3003:3003 \
  -p 8333:8333 \
  -v openreader_docstore:/app/docstore \
  -v /path/to/your/library:/app/docstore/library:ro \
  -e API_BASE=http://host.docker.internal:8880/v1 \
  -e API_KEY=none \
  -e BASE_URL=http://localhost:3003 \
  -e AUTH_SECRET=<paste_the_output_of_openssl_here> \
  ghcr.io/richardr1126/openreader-webui:latest
```

You can remove `/app/docstore/library` if you do not need server library import.
You can remove either `BASE_URL` or `AUTH_SECRET` to keep auth disabled.

Quick notes:

- `API_BASE` should point to your TTS server base URL.
- Expose `8333` for direct browser access to embedded SeaweedFS presigned URLs.
- If `8333` is not exposed, uploads still work through `/api/documents/blob/upload/fallback`.
- To enable auth, set both `BASE_URL` and `AUTH_SECRET`.
- DB migrations run automatically during container startup via the shared entrypoint.

For all environment variables, see [Environment Variables](../guides/environment-variables).
For app/auth behavior, see [Auth](../guides/configuration).
For database startup and migration behavior, see [SQL Database](../operations/database-and-migrations).
For blob behavior and mounts, see [Object / Blob Storage](../guides/storage-and-blob-behavior).

## 2. Configure settings in the app UI

- Set TTS provider and model in Settings
- Set TTS API base URL and API key if needed
- Select the model voice from the voice dropdown

## 3. Update Docker image

```bash
docker stop openreader-webui || true && \
docker rm openreader-webui || true && \
docker image rm ghcr.io/richardr1126/openreader-webui:latest || true && \
docker pull ghcr.io/richardr1126/openreader-webui:latest
```

Visit [http://localhost:3003](http://localhost:3003) after startup.
