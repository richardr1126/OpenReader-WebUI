---
title: Local Development
---

## Prerequisites

- Node.js (recommended with [nvm](https://github.com/nvm-sh/nvm))
- `pnpm` (recommended) or `npm`

```bash
npm install -g pnpm
```

- A reachable TTS API server
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs) `weed` binary (required)

```bash
brew install seaweedfs
```

Optional, depending on features:

- [libreoffice](https://www.libreoffice.org) (required for DOCX conversion)

```bash
brew install libreoffice
```

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (optional, for word-by-word highlighting)

```bash
# clone and build whisper.cpp (no model download needed – OpenReader handles that)
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j --config Release

# point OpenReader to the compiled whisper-cli binary
echo WHISPER_CPP_BIN="$(pwd)/build/bin/whisper-cli"
```

:::note
Set `WHISPER_CPP_BIN` in your `.env` to enable word-by-word highlighting.
:::

## Steps

1. Clone the repository.

```bash
git clone https://github.com/richardr1126/OpenReader-WebUI.git
cd OpenReader-WebUI
```

2. Install dependencies.

```bash
pnpm i
```

3. Configure the environment.

```bash
cp .env.example .env
```

Then edit `.env`.

Auth is enabled when both are set:

- `BASE_URL` (for local dev, typically `http://localhost:3003`)
- `AUTH_SECRET` (generate with `openssl rand -base64 32`)

Optional:

- `AUTH_TRUSTED_ORIGINS=http://localhost:3003,http://192.168.0.116:3003`
- Stable S3 credentials via `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`
- External S3 storage by setting `USE_EMBEDDED_WEED_MINI=false` and related S3 vars

For all environment variables, see [Environment Variables](../reference/environment-variables).
For app/auth behavior, see [Auth](../configure/configuration).
For storage configuration, see [Object / Blob Storage](../configure/storage-and-blob-behavior).
For database mode and migrations, see [Database and Migrations](../configure/database-and-migrations).

4. Run DB migrations.

- Migrations run automatically on startup through the shared entrypoint for both `pnpm dev` and `pnpm start`.
- You only need manual migration commands for one-off troubleshooting or explicit migration workflows:

```bash
pnpm migrate
```

:::note
If `POSTGRES_URL` is set, migrations target Postgres; otherwise local SQLite is used. To disable automatic startup migrations, set `RUN_DRIZZLE_MIGRATIONS=false` and/or `RUN_FS_MIGRATIONS=false`. You can run storage migration manually with `pnpm migrate-fs`.
:::

5. Start the app.

```bash
pnpm dev
```

Or build + start production mode:

```bash
pnpm build
pnpm start
```

Visit [http://localhost:3003](http://localhost:3003).
