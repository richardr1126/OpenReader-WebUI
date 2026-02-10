[![GitHub Stars](https://img.shields.io/github/stars/richardr1126/OpenReader-WebUI)](../../stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/richardr1126/OpenReader-WebUI)](../../network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/richardr1126/OpenReader-WebUI)](../../watchers)
[![GitHub Issues](https://img.shields.io/github/issues/richardr1126/OpenReader-WebUI)](../../issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/richardr1126/OpenReader-WebUI)](../../commits)
[![GitHub Release](https://img.shields.io/github/v/release/richardr1126/OpenReader-WebUI)](../../releases)

[![Discussions](https://img.shields.io/badge/Discussions-Ask%20a%20Question-blue)](../../discussions)

# 📄🔊 OpenReader WebUI

OpenReader WebUI is an open source text to speech document reader web app built using Next.js, offering a TTS read along experience with narration for **EPUB, PDF, TXT, MD, and DOCX documents**. It supports multiple TTS providers including OpenAI, Deepinfra, and custom OpenAI-compatible endpoints like [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) and [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)

- 🎯 **Multi-Provider TTS Support**
  - [**Kokoro-FastAPI**](https://github.com/remsky/Kokoro-FastAPI): Supporting multi-voice combinations (like `af_heart+af_bella`)
  - [**Orpheus-FastAPI**](https://github.com/Lex-au/Orpheus-FastAPI)
  - **Custom OpenAI-compatible**: Any TTS API with `/v1/audio/voices` and `/v1/audio/speech` endpoints
  - **Cloud TTS Providers (requiring API keys)**
    - [**Deepinfra**](https://deepinfra.com/models/text-to-speech): Kokoro-82M + models with support for cloned voices and more
    - [**OpenAI API ($$)**](https://platform.openai.com/docs/pricing#transcription-and-speech): tts-1, tts-1-hd, and gpt-4o-mini-tts w/ instructions
- 🛜 *(Updated)* **Server-side Sync and Storage**
  - *(New)* **External Library Import** enables importing documents to the browser's storage from a folder mounted on the server
  - *(Updated)* **Sync documents** between the browser and server to get them on other browsers or devices
- 🎧 **Server-side Audiobook Export** in **m4b/mp3**, with resumable, chapter-based export and regeneration
- 📖 **Read Along Experience** providing real-time text highlighting during playback (PDF/EPUB)
  - *(New)* **Word-by-word** highlighting uses word-by-word timestamps generated server-side with [*whisper.cpp*](https://github.com/ggml-org/whisper.cpp) (optional)
- 🧠 **Smart Sentence-Aware Narration** merges sentences across pages/chapters for smoother TTS
- 🚀 **Optimized Next.js TTS Proxy** with audio caching and optimized repeat playback
- 🎨 **Customizable Experience**
  - 🎨 Multiple app theme options
  - ⚙️ Various TTS and document handling settings
  - And more ...

## 🐳 Docker Quick Start

### Prerequisites

- Recent version of Docker installed on your machine
- A TTS API server (Kokoro-FastAPI, Orpheus-FastAPI, Deepinfra, OpenAI, etc.) running and accessible

> **Note:** If you have good hardware, you can run [Kokoro-FastAPI with Docker locally](#🗣️-local-kokoro-fastapi-quick-start-cpu-or-gpu) (see below).

### 1. 🐳 Start the Docker container

  Minimal (auth disabled, embedded storage is ephemeral, no library import):

  ```bash
  docker run --name openreader-webui \
    --restart unless-stopped \
    -p 3003:3003 \
    -p 8333:8333 \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  Fully featured (persistent storage, embedded SeaweedFS `weed mini` for documents, optional auth):

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

  You can remove the `/app/docstore/library` mount if you don't need server library import.
  You can remove either `BASE_URL` or `AUTH_SECRET` to keep auth disabled.

  Quick notes:
  - `API_BASE` should point to your TTS API server's base URL (for local Docker Kokoro, use `http://host.docker.internal:8880/v1`).
  - Expose `-p 8333:8333` for direct browser access to embedded SeaweedFS presigned URLs.
  - If port `8333` is not exposed, uploads still work via `/api/documents/blob/upload/fallback`.
  - To enable auth, set both `BASE_URL` and `AUTH_SECRET`.

  <details>
  <summary><strong>Docker networking and blob behavior</strong> (Click to expand)</summary>

  **Ports**

  - `3003` serves the OpenReader app and API routes.
  - `8333` serves embedded SeaweedFS S3 for browser direct blob access.

  **Upload behavior**

  - Primary upload path: browser uploads to presigned URL from `/api/documents/blob/upload/presign`.
  - Fallback upload path: `/api/documents/blob/upload/fallback` if direct upload fails.
  - Content serving path: `/api/documents/blob` (server-served bytes/snippets).

  </details>

  <details>
  <summary><strong>Which Docker setup should I use?</strong> (Click to expand)</summary>

  | Goal | Recommended setup |
  | --- | --- |
  | Fast local setup, no persistence | Minimal `docker run` example |
  | Persistent docs/audiobooks and optional auth | Fully featured `docker run` example with `/app/docstore` volume |
  | Browser direct blob uploads/downloads | Publish both `3003` and `8333` |
  | Private blob endpoint (no `8333` published) | Keep using app APIs; uploads use fallback proxy when direct presigned upload is unreachable |

  </details>

  <details>
  <summary><strong>Common Docker environment variables</strong> (Click to expand)</summary>

  | Variable | Purpose | Example / Notes |
  | --- | --- | --- |
  | `API_BASE` | Default TTS API base URL (server-side) | `http://host.docker.internal:8880/v1` |
  | `API_KEY` | Default TTS API key | `none` or your provider key |
  | `BASE_URL` | Enables auth when set with `AUTH_SECRET` | External URL for this app, e.g. `http://localhost:3003` or `https://reader.example.com` |
  | `AUTH_SECRET` | Enables auth when set with `BASE_URL` | Generate with `openssl rand -base64 32` |
  | `AUTH_TRUSTED_ORIGINS` | Extra allowed auth request origins | Comma-separated list; leave empty to trust only `BASE_URL` |
  | `POSTGRES_URL` | Use Postgres for server DB (metadata + auth tables) instead of SQLite | If set, startup migrations target Postgres |
  | `GITHUB_CLIENT_ID` | Optional GitHub OAuth sign-in | Requires `GITHUB_CLIENT_SECRET` |
  | `GITHUB_CLIENT_SECRET` | Optional GitHub OAuth sign-in | Requires `GITHUB_CLIENT_ID` |

  </details>

  <details>
  <summary><strong>Blob and embedded storage environment variables</strong> (Click to expand)</summary>

  | Variable | Purpose | Example / Notes |
  | --- | --- | --- |
  | `USE_EMBEDDED_WEED_MINI` | Start SeaweedFS before app startup | default: `true` when unset in shared entrypoint |
  | `WEED_MINI_DIR` | Data directory for embedded `weed mini` | default: `docstore/seaweedfs` |
  | `WEED_MINI_WAIT_SEC` | Startup wait timeout for embedded `weed mini` | default: `20` |
  | `S3_BUCKET` | S3 bucket used for document blobs | default: `openreader-documents` in embedded mode |
  | `S3_REGION` | S3 region used by AWS SDK | default: `us-east-1` in embedded mode |
  | `S3_ENDPOINT` | Custom endpoint for S3-compatible providers | default: `http://<BASE_URL host>:8333` when `BASE_URL` is set, otherwise detected LAN host |
  | `S3_ACCESS_KEY_ID` | S3 access key | auto-generated in embedded mode if unset |
  | `S3_SECRET_ACCESS_KEY` | S3 secret key | auto-generated in embedded mode if unset |
  | `S3_FORCE_PATH_STYLE` | Force path-style addressing | default: `true` in embedded mode |
  | `S3_PREFIX` | Prefix for stored object keys | default: `openreader` |

  </details>

  <details>
  <summary><strong>Docker volume mounts</strong> (Click to expand)</summary>

  | Mount | Type | Recommended | Purpose | Example |
  | --- | --- | --- | --- | --- |
  | `/app/docstore` | Docker named volume | Yes (if you want persistence) | Persists embedded SeaweedFS blob data (`docstore/seaweedfs`), SQLite metadata DB (`docstore/sqlite3.db` when `POSTGRES_URL` is unset), audiobook export artifacts, and migration/runtime files | `-v openreader_docstore:/app/docstore` |
  | `/app/docstore/library` | Bind mount (host folder) | Optional + `:ro` | Read-only source directory for **Server Library Import**; files are imported/copied into browser storage, not modified in place | `-v /path/to/your/library:/app/docstore/library:ro` |

  To import from the mounted library: **Settings → Documents → Server Library Import**

  > **Note:** Every file in the mounted library is imported into the client browser's storage. Keep the library reasonably sized to avoid performance issues.

  </details>

  Visit [http://localhost:3003](http://localhost:3003) to run the app and set your settings.

### 2. ⚙️ Configure the app settings in the UI

- Set the TTS Provider and Model in the Settings modal
- Set the TTS API Base URL and API Key if needed (more secure to set in env vars)
- Select your model's voice from the dropdown (voices try to be fetched from TTS Provider API)

### 3. ⬆️ Updating Docker Image

```bash
docker stop openreader-webui || true && \
docker rm openreader-webui || true && \
docker image rm ghcr.io/richardr1126/openreader-webui:latest || true && \
docker pull ghcr.io/richardr1126/openreader-webui:latest
```

### 🗣️ Local Kokoro-FastAPI Quick-start (CPU or GPU)

You can run the Kokoro TTS API server directly with Docker. **We are not responsible for issues with [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).** For best performance, use an NVIDIA GPU (for GPU version) or Apple Silicon (for CPU version).

<details>
<summary>

**Kokoro-FastAPI (CPU)**

</summary>

```bash
docker run -d \
  --name kokoro-tts \
  --restart unless-stopped \
  -p 8880:8880 \
  -e ONNX_NUM_THREADS=8 \
  -e ONNX_INTER_OP_THREADS=4 \
  -e ONNX_EXECUTION_MODE=parallel \
  -e ONNX_OPTIMIZATION_LEVEL=all \
  -e ONNX_MEMORY_PATTERN=true \
  -e ONNX_ARENA_EXTEND_STRATEGY=kNextPowerOfTwo \
  -e API_LOG_LEVEL=DEBUG \
  ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.4
```

> Adjust environment variables as needed for your hardware and use case.

</details>

<details>
<summary>

**Kokoro-FastAPI (GPU)**

</summary>

```bash
docker run -d \
  --name kokoro-tts \
  --gpus all \
  --user 1001:1001 \
  --restart unless-stopped \
  -p 8880:8880 \
  -e USE_GPU=true \
  -e PYTHONUNBUFFERED=1 \
  -e API_LOG_LEVEL=DEBUG \
  ghcr.io/remsky/kokoro-fastapi-gpu:v0.2.4
```

> Adjust environment variables as needed for your hardware and use case.

</details>

> **⚠️ Important Notes:**
>
> - For best results, set the `-e API_BASE=` for OpenReader's Docker to `http://kokoro-tts:8880/v1`
> - For issues or support, see the [Kokoro-FastAPI repository](https://github.com/remsky/Kokoro-FastAPI).
> - The GPU version requires NVIDIA Docker support and works best with NVIDIA GPUs. The CPU version works best on Apple Silicon or modern x86 CPUs.

## Local Development Installation

### Prerequisites

- Node.js (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- pnpm (recommended) or npm

    ```bash
    npm install -g pnpm
    ```

- A TTS API server (Kokoro-FastAPI, Orpheus-FastAPI, Deepinfra, OpenAI, etc.) running and accessible
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs) `weed` binary (required)

    ```bash
    brew install seaweedfs
    ```

    > **Note:** Verify install with `weed version`.

#### Optionally required for different features:
- [FFmpeg](https://ffmpeg.org) (required for audiobook m4b creation only)

    ```bash
    brew install ffmpeg
    ```

- [libreoffice](https://www.libreoffice.org) (required for DOCX files)

    ```bash
    brew install libreoffice
    ```

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (optional, required for word-by-word highlighting)

    ```bash
    # clone and build whisper.cpp (no model download needed – OpenReader handles that)
    git clone https://github.com/ggml-org/whisper.cpp.git
    cd whisper.cpp
    cmake -B build
    cmake --build build -j --config Release

    # point OpenReader to the compiled whisper-cli binary
    echo WHISPER_CPP_BIN=\"$(pwd)/build/bin/whisper-cli\"
    ```

    > **Note:** The `WHISPER_CPP_BIN` path should be set in your `.env` file for OpenReader to use word-by-word highlighting features.

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/richardr1126/OpenReader-WebUI.git
   cd OpenReader-WebUI
   ```

2. Install dependencies:

   With pnpm (recommended):

   ```bash
   pnpm i # or npm i
   ```

3. Configure the environment:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration settings
   ```

   Auth is recommended for contributors and is enabled when **both** values are set:

   - Set `BASE_URL` to your local URL (default: `http://localhost:3003`)
   - Generate a `AUTH_SECRET` and paste it into `.env`:

     ```bash
     openssl rand -base64 32
     ```
   - (Optional) If you use both localhost and LAN URL, set `AUTH_TRUSTED_ORIGINS` (leave empty to trust only `BASE_URL`):

     ```bash
     AUTH_TRUSTED_ORIGINS=http://localhost:3003,http://192.168.0.116:3003
     ```
   
   The embedded weed mini object store is enabled by default for local development, and started through the shared entrypoint. The ACCESS_KEY_ID and SECRET_ACCESS_KEY are auto-generated if unset, but for stable credentials across restarts, you can generate and set them in `.env`:
   - (Optional) Generate `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` and paste them into `.env` for stable credentials:

     ```bash
     S3_ACCESS_KEY_ID=<`openssl rand -hex 16`>
     S3_SECRET_ACCESS_KEY=<`openssl rand -hex 32`>
     ```
   - (Optional) Connect to external S3-compatible storage instead of embedded `weed mini`:

     ```bash
     USE_EMBEDDED_WEED_MINI=false

     # Required
     S3_BUCKET=your-bucket
     S3_REGION=us-east-1
     S3_ACCESS_KEY_ID=your-access-key
     S3_SECRET_ACCESS_KEY=your-secret-key

     # Optional / provider-specific
     S3_ENDPOINT=
     S3_FORCE_PATH_STYLE=
     S3_PREFIX=openreader
     ```

     Notes:
     - For AWS S3: usually leave `S3_ENDPOINT` empty and `S3_FORCE_PATH_STYLE` empty/false.
     - For MinIO/SeaweedFS/R2/B2 S3: set `S3_ENDPOINT` to your endpoint URL and set `S3_FORCE_PATH_STYLE=true` when required by that provider.
   
   > Notes:
   > - The base URL for the TTS API should be accessible and relative to the Next.js server
   >
   > - To disable auth, remove either `BASE_URL` or `AUTH_SECRET`.
   >
   > - If S3 credentials are unset, they are auto-generated per startup.

4. Run DB migrations:

   - **Production / Docker**: Migrations run automatically on startup via `pnpm start`.
   - **Development**: When using `pnpm dev`, it needs to be run explicitly:

      ```bash
      pnpm migrate
      ```

    > Note: If you set `POSTGRES_URL` in `.env`, migrations will target Postgres instead of local SQLite.
    >
    > Generating migrations (contributors):
    > - `pnpm generate` generates migrations for **both** SQLite and Postgres (requires `POSTGRES_URL`).
    >
    > Manual Drizzle Kit runs:
    > - SQLite migrate: `npx drizzle-kit migrate --config drizzle.config.sqlite.ts`
    > - Postgres migrate: `npx drizzle-kit migrate --config drizzle.config.pg.ts`
    > - SQLite generate: `npx drizzle-kit generate --config drizzle.config.sqlite.ts`
    > - Postgres generate: `npx drizzle-kit generate --config drizzle.config.pg.ts`

5. Start the development server:

   With pnpm (recommended):

   ```bash
   pnpm dev # or npm run dev
   ```

   or build and run the production server:

   With pnpm:

   ```bash
   pnpm build # or npm run build
   pnpm start # or npm start
   ```

   Visit [http://localhost:3003](http://localhost:3003) to run the app.

## 💡 Feature requests

For feature requests or ideas you have for the project, please use the [Discussions](https://github.com/richardr1126/OpenReader-WebUI/discussions) tab.

## 🙋‍♂️ Support and issues

If you encounter issues, please open an issue on GitHub following the template (which is very light).

## 👥 Contributing

Contributions are welcome! Fork the repository and submit a pull request with your changes.

## ❤️ Acknowledgements

This project would not be possible without standing on the shoulders of these giants:

- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) model
- [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)
- [Better Auth](https://www.better-auth.com/)
- [SQLite](https://www.sqlite.org/)
- [PostgreSQL](https://www.postgresql.org/)
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (`weed mini`)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [ffmpeg](https://ffmpeg.org)
- [react-pdf](https://github.com/wojtekmaj/react-pdf) npm package
- [react-reader](https://github.com/happyr/react-reader) npm package

## Docker Supported Architectures

- linux/amd64 (x86_64)
- linux/arm64 (Apple Silicon, Raspberry Pi, SBCs, etc.)

## Stack

- **Framework:** [Next.js](https://nextjs.org/) 15 (App Router), [React](https://react.dev/) 19, [TypeScript](https://www.typescriptlang.org/)
- **Containerization / Runtime:** [Docker](https://www.docker.com/) (linux/amd64 + linux/arm64), with a shared entrypoint that can bootstrap embedded SeaweedFS before app startup
- **Next.js Client:**
  - **UI:** [Tailwind CSS](https://tailwindcss.com), [Headless UI](https://headlessui.com), [@tailwindcss/typography](https://tailwindcss.com/docs/typography-plugin)
  - **Interactions:** `react-dnd`, `react-dropzone`
  - **Authentication:** [Better Auth](https://www.better-auth.com/) client SDK (`better-auth/react`, anonymous client plugin)
  - **Local storage/cache:** [Dexie.js](https://dexie.org/) (IndexedDB) for documents, cache, and app settings
  - **Document rendering:**
    - **PDF:** [react-pdf](https://github.com/wojtekmaj/react-pdf), [pdf.js](https://mozilla.github.io/pdf.js/)
    - **EPUB:** [react-reader](https://github.com/gerhardsletten/react-reader), [epubjs](https://github.com/futurepress/epub.js/)
    - **Markdown/Text:** [react-markdown](https://github.com/remarkjs/react-markdown), [remark-gfm](https://github.com/remarkjs/remark-gfm)
  - **Text preprocessing / matching:** [compromise](https://github.com/spencermountain/compromise), [cmpstr](https://github.com/remsky/cmpstr)
- **Next.js Server:**
  - **APIs:** Next.js Route Handlers for document sync, blob/content access, migration flows, audiobook export, and TTS/Whisper proxying
  - **Authentication:** [Better Auth](https://www.better-auth.com/) server handlers/adapters for session and auth routing
  - **Text preprocessing / NLP utilities:** [compromise](https://github.com/spencermountain/compromise) via shared `lib/nlp` helpers used in server processing paths
  - **Metadata database:** [Drizzle ORM](https://orm.drizzle.team/), [SQLite](https://www.sqlite.org/) (`better-sqlite3`) by default, optional [PostgreSQL](https://www.postgresql.org/) (`pg`)
  - **Blob/object storage:** embedded [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (`weed mini`) by default, or external S3-compatible storage via AWS SDK v3 (`@aws-sdk/client-s3`, presigned URLs, upload fallback proxy)
  - **Audio/processing pipeline:** OpenAI-compatible TTS providers (OpenAI, DeepInfra, Kokoro, Orpheus, custom), [ffmpeg](https://ffmpeg.org/) for audiobook assembly, optional [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for word-level timestamps
- **Tooling / Testing:** ESLint, TypeScript, [Playwright](https://playwright.dev/) end-to-end tests, and Drizzle migrations/generation scripts

## License

This project is licensed under the MIT License.
