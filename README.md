[![GitHub Stars](https://img.shields.io/github/stars/richardr1126/OpenReader-WebUI)](../../stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/richardr1126/OpenReader-WebUI)](../../network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/richardr1126/OpenReader-WebUI)](../../watchers)
[![GitHub Issues](https://img.shields.io/github/issues/richardr1126/OpenReader-WebUI)](../../issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/richardr1126/OpenReader-WebUI)](../../commits)
[![GitHub Release](https://img.shields.io/github/v/release/richardr1126/OpenReader-WebUI)](../../releases)

[![Discussions](https://img.shields.io/badge/Discussions-Ask%20a%20Question-blue)](../../discussions)

# 📄🔊 OpenReader WebUI

OpenReader WebUI is an open source text to speech document reader web app built using Next.js, offering a TTS read along experience with narration for **EPUB, PDF, TXT, MD, and DOCX documents**. It supports multiple TTS providers including OpenAI, Deepinfra, and custom OpenAI-compatible endpoints like [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) and [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)

- 🧠 *(New)* **Smart Sentence-Aware Narration** merges sentences across pages/chapters for smoother TTS
- 🎧 *(New)* **Reliable Audiobook Export** in **m4b/mp3**, with resumable, chapter-based export and regeneration
- 🎯 *(New)* **Multi-Provider TTS Support**
  - [**Kokoro-FastAPI**](https://github.com/remsky/Kokoro-FastAPI): Supporting multi-voice combinations (like `af_heart+af_bella`)
  - [**Orpheus-FastAPI**](https://github.com/Lex-au/Orpheus-FastAPI)
  - **Custom OpenAI-compatible**: Any TTS API with `/v1/audio/voices` and `/v1/audio/speech` endpoints
  - **Cloud TTS Providers (requiring API keys)**
    - [**Deepinfra**](https://deepinfra.com/models/text-to-speech): Kokoro-82M + models with support for cloned voices and more
    - [**OpenAI API ($$)**](https://platform.openai.com/docs/pricing#transcription-and-speech): tts-1, tts-1-hd, and gpt-4o-mini-tts w/ instructions
- 🚀 *(New)* **Optimized Next.js TTS Proxy** with audio caching and optimized repeat playback
- 💾 *(Updated)* **Local-First Architecture** stores documents and more in-browser with Dexie.js
- 📖 *(Updated)* **Read Along Experience** providing real-time text highlighting during playback (PDF/EPUB)
- 🛜 **Optional Server-side documents** using backend `/docstore` for all users
- 🎨 **Customizable Experience**
  - 🎨 Multiple app theme options
  - ⚙️ Various TTS and document handling settings
  - And more ...

<details>
<summary>

### 🆕 What's New in v1.0.0

</summary>

- 🧠 **Smart sentence continuation**  
  - Improved NLP handling of complex structures and quoted dialogue provides more natural sentence boundaries and a smoother audio-text flow.  
  - EPUB and PDF playback now use smarter sentence splitting and continuation metadata so sentences that cross page/chapter boundaries are merged before hitting the TTS API.  
  - This yields more natural narration and fewer awkward pauses when a sentence spans multiple pages or EPUB spine items.
- 📄 **Modernized PDF text highlighting pipeline**  
  - Real-time PDF text highlighting is now offloaded to a dedicated Web Worker so scrolling and playback controls remain responsive during narration.  
  - A new overlay-based highlighting system draws independent highlight layers on top of the PDF, avoiding interference with the underlying text layer.  
  - Upgraded fuzzy matching with Dice-based similarity improves the accuracy of mapping spoken words to on-screen text.  
  - A new per-device setting lets you enable or disable real-time PDF highlighting during playback for a more tailored reading experience.  
- 🎧 **Chapter/page-based audiobook export with resume & regeneration**  
  - Per-chapter/per-page generation to disk with persistent `bookId`  
  - Resumable generation (can cancel and continue later)  
  - Per-chapter regeneration & deletion  
  - Final combined **M4B** or **MP3** download with embedded chapter metadata.  
- 💾 **Dexie-backed local storage & sync**  
  - All document types (PDF, EPUB, TXT/MD-as-HTML) and config are stored via a unified Dexie layer on top of IndexedDB.  
  - Document lists use live Dexie queries (no manual refresh needed), and server sync now correctly includes text/markdown documents as part of the library backup.  
- 🗣️ **Kokoro multi-voice selection & utilities**  
  - Kokoro models now support multi-voice combination, with provider-aware limits and helpers (not supported on OpenAI or Deepinfra)
- ⚡ **Faster, more efficient TTS backend proxy**  
  - In-memory **LRU caching** for audio responses with configurable size/TTL  
  - **ETag** support (`304` on cache hits) + `X-Cache` headers (`HIT` / `MISS` / `INFLIGHT`)  
- 📄 **More robust DOCX → PDF conversion**  
  - DOCX conversion now uses isolated per-job LibreOffice profiles and temp directories, polls for a stable output file size, and aggressively cleans up temp files.  
  - This reduces cross-job interference and flakiness when converting multiple DOCX files in parallel.
- ♿ **Accessibility & layout improvements**  
  - Dialogs and folder toggles expose proper roles and ARIA attributes.  
  - PDF/EPUB/HTML readers use a full-height app shell with a sticky bottom TTS bar, improved scrollbars, and refined focus styles.
- ✅ **End-to-end Playwright test suite with TTS mocks**  
  - Deterministic TTS responses in tests via a reusable Playwright route mock.  
  - Coverage for accessibility, upload, navigation, folder management, deletion flows, audiobook generation/export and playback across all document types.

</details>

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
    -v openreader_docstore:/app/docstore \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  (Optionally): Set the TTS `API_BASE` URL and/or `API_KEY` to be default for all devices
  ```bash
  docker run --name openreader-webui \
    --restart unless-stopped \
    -e API_KEY=none \
    -e API_BASE=http://host.docker.internal:8880/v1 \
    -p 3003:3003 \
    -v openreader_docstore:/app/docstore \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  > **Note:** Requesting audio from the TTS API happens on the Next.js server not the client. So the base URL for the TTS API should be accessible and relative to the Next.js server. If it is in a Docker you may need to use `host.docker.internal` to access the host machine, instead of `localhost`.

  Visit [http://localhost:3003](http://localhost:3003) to run the app and set your settings.

  > **Note:** The `openreader_docstore` volume is used to store server-side documents. You can mount a local directory instead. Or remove it if you don't need server-side documents.

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

### 🗣️ Local Kokoro-FastAPI Quick-start (CPU or GPU)

You can run the Kokoro TTS API server directly with Docker. **We are not responsible for issues with [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).** For best performance, use an NVIDIA GPU (for GPU version) or Apple Silicon (for CPU version).


<details>
<summary>

**Docker CPU**

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

**Docker GPU**

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
- [Orpheus-TTS](https://huggingface.co/collections/canopylabs/orpheus-tts-67d9ea3f6c05a941c06ad9d2) model
- [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)
- [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)
- [react-pdf](https://github.com/wojtekmaj/react-pdf) npm package
- [react-reader](https://github.com/happyr/react-reader) npm package

## Docker Supported Architectures
- linux/amd64 (x86_64)
- linux/arm64 (Apple Silicon, Raspberry Pi, SBCs, etc.)

## Stack

- **Framework:** Next.js (React)
- **Containerization:** Docker
- **Storage:** Dexie + IndexedDB (in-browser local database)
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
- **NLP:** [compromise](https://github.com/spencermountain/compromise) NLP library for sentence splitting

## License

This project is licensed under the MIT License.
