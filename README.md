[![GitHub Stars](https://img.shields.io/github/stars/richardr1126/OpenReader-WebUI)](../../stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/richardr1126/OpenReader-WebUI)](../../network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/richardr1126/OpenReader-WebUI)](../../watchers)
[![GitHub Issues](https://img.shields.io/github/issues/richardr1126/OpenReader-WebUI)](../../issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/richardr1126/OpenReader-WebUI)](../../commits)
[![GitHub Release](https://img.shields.io/github/v/release/richardr1126/OpenReader-WebUI)](../../releases)

[![Discussions](https://img.shields.io/badge/Discussions-Ask%20a%20Question-blue)](../../discussions)

# 📄🔊 OpenReader WebUI

OpenReader WebUI is an open source text to speech document reader web app built using Next.js, offering a TTS read along experience with narration for **EPUB, PDF, TXT, MD, and DOCX documents**. It supports multiple TTS providers including OpenAI, Deepinfra, and custom OpenAI-compatible endpoints like [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) and [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)

- 🎯 *(New)* **Multi-Provider TTS Support**
  - [**Kokoro-FastAPI**](https://github.com/remsky/Kokoro-FastAPI): Supporting multi-voice combinations (like `af_heart+af_bella`)
  - [**Orpheus-FastAPI**](https://github.com/Lex-au/Orpheus-FastAPI)
  - **Custom OpenAI-compatible**: Any TTS API with `/v1/audio/voices` and `/v1/audio/speech` endpoints
  - **Cloud TTS Providers (requiring API keys)**
    - [**Deepinfra**](https://deepinfra.com/models/text-to-speech): Kokoro-82M + models with support for cloned voices and more
    - [**OpenAI API ($$)**](https://platform.openai.com/docs/pricing#transcription-and-speech): tts-1, tts-1-hd, and gpt-4o-mini-tts w/ instructions
- 📖 *(Updated)* **Read Along Experience** providing real-time text highlighting during playback (PDF/EPUB)
  - *(New)* **Word-by-word** highlighting uses word-by-word timestamps generated server-side with [*whisper.cpp*](https://github.com/ggml-org/whisper.cpp) (optional)
- 🧠 *(New)* **Smart Sentence-Aware Narration** merges sentences across pages/chapters for smoother TTS
- 🎧 *(New)* **Reliable Audiobook Export** in **m4b/mp3**, with resumable, chapter-based export and regeneration
- 🚀 *(New)* **Optimized Next.js TTS Proxy** with audio caching and optimized repeat playback
- 💾 **Local-First Architecture** stores documents and more in-browser with Dexie.js
- 🛜 **Optional Server-side documents** using backend `/docstore` for all users
- 🎨 **Customizable Experience**
  - 🎨 Multiple app theme options
  - ⚙️ Various TTS and document handling settings
  - And more ...

## 🐳 Docker Quick Start

### Prerequisites
- Recent version of Docker installed on your machine
- A TTS API server (Kokoro-FastAPI, Orpheus-FastAPI, Deepinfra, OpenAI, etc.) running and accessible

> **Note:** If you have good hardware, you can run [Kokoro-FastAPI with Docker locally](#🗣️-local-kokoro-fastapi-quick-start-cpu-or-gpu) (see below).

### 1. 🐳 Start the Docker container:
  ```bash
  docker run --name openreader-webui \
    --restart unless-stopped \
    -p 3003:3003 \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  (Optionally): Set the TTS `API_BASE` URL and/or `API_KEY` to be default for all devices
  ```bash
  docker run --name openreader-webui \
    --restart unless-stopped \
    -e API_KEY=none \
    -e API_BASE=http://host.docker.internal:8880/v1 \
    -p 3003:3003 \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  Visit [http://localhost:3003](http://localhost:3003) to run the app and set your settings.

  > **Note:** Requesting audio from the TTS API happens on the Next.js server not the client. So the base URL for the TTS API should be accessible and relative to the Next.js server. If it is in a Docker you may need to use `host.docker.internal` to access the host machine, instead of `localhost`.

### 2. ⚙️ Configure the app settings in the UI:
  - Set the TTS Provider and Model in the Settings modal
  - Set the TTS API Base URL and API Key if needed (more secure to set in env vars)
  - Select your model's voice from the dropdown (voices try to be fetched from TTS Provider API)

### 3. ⬆️ Updating Docker Image
```bash
docker stop openreader-webui && \
docker rm openreader-webui && \
docker pull ghcr.io/richardr1126/openreader-webui:latest
```

### 📦 Volume mounts and Library import

By default (no volume mounts), OpenReader will store its server-side files inside the container filesystem (which is lost if you remove the container).

<details>
<summary>

**Persist server-side storage (`/app/docstore`)**

</summary>

Run the container with the volume mounted:
```bash
docker run --name openreader-webui \
  --restart unless-stopped \
  -p 3003:3003 \
  -v openreader_docstore:/app/docstore \
  ghcr.io/richardr1126/openreader-webui:latest
```
This will create a Docker named volume `openreader_docstore` to persist all server-side files, including:

- **Documents:** Stored under `/app/docstore/documents_v1`
- **Audiobook exports:** Stored under `/app/docstore/audiobooks_v1`
  - Per-audiobook settings: `/app/docstore/audiobooks_v1/<bookId>-audiobook/audiobook.meta.json`
  - Chapters: `0001__<title>.m4b` or `0001__<title>.mp3` (no per-chapter `.meta.json` files)
- **Settings**

This ensures that your documents, exported audiobooks, and server-side settings are retained even if the container is removed or recreated.

</details>

<details open>
<summary>

**Mount an external library folder (read-only recommended)**

</summary>

```bash
docker run --name openreader-webui \
  --restart unless-stopped \
  -p 3003:3003 \
  -v openreader_docstore:/app/docstore \
  -v /path/to/your/library:/app/docstore/library:ro \
  ghcr.io/richardr1126/openreader-webui:latest
```
Seperate from the docstore volume, this will mount an external folder to `/app/docstore/library` (read-only recommended). This allows you to connect OpenReader to an existing library of documents.

To import from the mounted library: **Settings → Documents → Server Library Import**

> **Note:** Every file in the mounted volume is imported to the client browser's storage. Please ensure that the mounted library is not too large to avoid performance issues.

</details>

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
   > Note: The base URL for the TTS API should be accessible and relative to the Next.js server

4. Start the development server:
   
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
