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

  Minimal (no persistence, auth disabled unless you set auth env vars):

  ```bash
  docker run --name openreader-webui \
    --restart unless-stopped \
    -p 3003:3003 \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  Fully featured (persistent storage + server library import + KokoroFastAPI in Docker + optional auth):

  ```bash
  docker run --name openreader-webui \
    --restart unless-stopped \
    -p 3003:3003 \
    -v openreader_docstore:/app/docstore \
    -v /path/to/your/library:/app/docstore/library:ro \
    -e API_BASE=http://host.docker.internal:8880/v1 \
    -e API_KEY=none \
    -e BETTER_AUTH_URL=http://localhost:3003 \
    -e BETTER_AUTH_SECRET=<paste_the_output_of_openssl_here> \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  You can remove the `/app/docstore/library` mount if you don't need server library import.
  You can remove both `BETTER_AUTH_*` env vars to keep auth disabled.

  > **Notes:**
  >
  > - `API_BASE` should point to your TTS API server's base URL (if running Kokoro-FastAPI locally in Docker, use `http://host.docker.internal:8880/v1`).
  > - `BETTER_AUTH_URL` should be your externally-facing URL for this app (for example `https://reader.example.com` or `http://localhost:3003`).
  > - To enable auth, set **both** `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` generated with `openssl rand -base64 32`.
  > - If you set `POSTGRES_URL`, the container will attempt to run migrations against it. Ensure the database is accessible.

  <details>
  <summary><strong>Docker environment variables</strong> (Click to expand)</summary>

  | Variable | Purpose | Example / Notes |
  | --- | --- | --- |
  | `API_BASE` | Default TTS API base URL (server-side) | `http://host.docker.internal:8880/v1` |
  | `API_KEY` | Default TTS API key | `none` or your provider key |
  | `BETTER_AUTH_URL` | Enables auth when set with `BETTER_AUTH_SECRET` | External URL for this app, e.g. `http://localhost:3003` or `https://reader.example.com` |
  | `BETTER_AUTH_SECRET` | Enables auth when set with `BETTER_AUTH_URL` | Generate with `openssl rand -base64 32` |
  | `POSTGRES_URL` | Use Postgres for auth storage instead of SQLite | If set, startup migrations target Postgres |
  | `GITHUB_CLIENT_ID` | Optional GitHub OAuth sign-in | Requires `GITHUB_CLIENT_SECRET` |
  | `GITHUB_CLIENT_SECRET` | Optional GitHub OAuth sign-in | Requires `GITHUB_CLIENT_ID` |

  </details>

  <details>
  <summary><strong>Docker volume mounts</strong> (Click to expand)</summary>

  | Mount | Type | Recommended | Purpose | Example |
  | --- | --- | --- | --- | --- |
  | `/app/docstore` | Docker named volume | Yes | Persists server-side storage (documents, audiobook exports, settings, SQLite DB if used) | `-v openreader_docstore:/app/docstore` |
  | `/app/docstore/library` | Bind mount (host folder) | Optional + `:ro` | Exposes an existing folder of documents for **Server Library Import** | `-v /path/to/your/library:/app/docstore/library:ro` |

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
docker stop openreader-webui && \
docker rm openreader-webui && \
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
Optionally required for different features:
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
   cp template.env .env
   # Edit .env with your configuration settings
   ```

   Auth is recommended for contributors and is enabled when **both** values are set:

   - Set `BETTER_AUTH_URL` to your local URL (default: `http://localhost:3003`)
   - Generate a `BETTER_AUTH_SECRET` and paste it into `.env`:

     ```bash
     openssl rand -base64 32
     ```

   > Note: To disable auth, remove either `BETTER_AUTH_URL` or `BETTER_AUTH_SECRET`.
   >
   > Note: The base URL for the TTS API should be accessible and relative to the Next.js server

4. Run auth DB migrations:

   - **Production / Docker**: Migrations run automatically on startup via `pnpm start`.
   - **Development**: Run explicitly:

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
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [ffmpeg](https://ffmpeg.org)
- [react-pdf](https://github.com/wojtekmaj/react-pdf) npm package
- [react-reader](https://github.com/happyr/react-reader) npm package

## Docker Supported Architectures

- linux/amd64 (x86_64)
- linux/arm64 (Apple Silicon, Raspberry Pi, SBCs, etc.)

## Stack

- **Framework:** Next.js (React)
- **Containerization:** Docker
- **Storage:**
  - [Dexie.js](https://dexie.org/) IndexedDB wrapper for client-side storage
- **PDF:**
  - [react-pdf](https://github.com/wojtekmaj/react-pdf)
  - [pdf.js](https://mozilla.github.io/pdf.js/)
- **EPUB:**
  - [react-reader](https://github.com/gerhardsletten/react-reader)
  - [epubjs](https://github.com/futurepress/epub.js/)
- **Markdown/Text:**
  - [react-markdown](https://github.com/remarkjs/react-markdown)
  - [remark-gfm](https://github.com/remarkjs/remark-gfm)
- **UI:**
  - [Tailwind CSS](https://tailwindcss.com)
  - [Headless UI](https://headlessui.com)
  - [@tailwindcss/typography](https://tailwindcss.com/docs/typography-plugin)
- **TTS:** (tested on)
  - [Deepinfra API](https://deepinfra.com) (Kokoro-82M, Orpheus-3B, Sesame-1B)
  - [Kokoro FastAPI TTS](https://github.com/remsky/Kokoro-FastAPI/tree/v0.0.5post1-stable)
  - [Orpheus FastAPI TTS](https://github.com/Lex-au/Orpheus-FastAPI)
- **NLP:**
  - [compromise](https://github.com/spencermountain/compromise) NLP library for sentence splitting
  - [cmpstr](https://github.com/remsky/cmpstr) String comparison library
  - [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for TTS timestamps (word-by-word highlighting)

## License

This project is licensed under the MIT License.
