[![GitHub Stars](https://img.shields.io/github/stars/richardr1126/OpenReader-WebUI)](../../stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/richardr1126/OpenReader-WebUI)](../../network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/richardr1126/OpenReader-WebUI)](../../watchers)
[![GitHub Issues](https://img.shields.io/github/issues/richardr1126/OpenReader-WebUI)](../../issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/richardr1126/OpenReader-WebUI)](../../commits)
[![GitHub Release](https://img.shields.io/github/v/release/richardr1126/OpenReader-WebUI)](../../releases)

[![Discussions](https://img.shields.io/badge/Discussions-Ask%20a%20Question-blue)](../../discussions)

# OpenReader WebUI 📄🔊

OpenReader WebUI is a document reader with Text-to-Speech capabilities, offering a TTS read along experience with narration for EPUB, PDF, TXT, MD, and DOCX documents. It supports multiple TTS providers including OpenAI, Deepinfra, and custom OpenAI-compatible endpoints like [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) and [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)

- 🎯 **Multi-Provider TTS Support**: 
  - **OpenAI**: tts-1, tts-1-hd, gpt-4o-mini-tts models with voices (alloy, echo, fable, onyx, nova, shimmer)
  - **Deepinfra**: Kokoro-82M, Orpheus-3B, Sesame-1B models with extensive voice libraries
  - **Custom OpenAI-Compatible**: Any OpenAI-compatible endpoint with custom voice sets
  - Provider-specific voice management with automatic voice restoration per provider-model combination
- 💾 **Local-First Architecture**: Uses IndexedDB browser storage for documents
- 🛜 **Optional Server-side documents**: Manually upload documents to the next backend for all users to download
- 📖 **Read Along Experience**: Follow along with highlighted text as the TTS narrates
- 📄 **Document formats**: EPUB, PDF, TXT, MD, DOCX (with libreoffice installed)
- 🎧 **Audiobook Creation**: Create and export audiobooks from PDF and ePub files **(in m4b format with ffmpeg and aac TTS output)**
- 🎨 **Customizable Experience**: 
  - 🔑 Select TTS provider (OpenAI, Deepinfra, or Custom OpenAI-compatible)
  - 🔐 Set TTS API base URL and optional API key
  - 🎨 Multiple app theme options
  - And more...

### 🛠️ Work in progress
- [ ] **Native .docx support** (currently requires libreoffice)
- [ ] **Accessibility Improvements**

## 🐳 Docker Quick Start

### Prerequisites
- Recent version of Docker installed on your machine
- A TTS API server (Kokoro-FastAPI, Orpheus-FastAPI, Deepinfra, OpenAI, etc.) running and accessible

### 1. 🐳 Start the Docker container:
  ```bash
  docker run --name openreader-webui \
    -p 3003:3003 \
    -v openreader_docstore:/app/docstore \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  (Optionally): Set the TTS `API_BASE` URL and/or `API_KEY` to be default for all devices
  ```bash
  docker run --name openreader-webui \
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

### (Alternate) 🐳 Configuration with Docker Compose and Kokoro-FastAPI

A complete example docker-compose file with Kokoro-FastAPI and OpenReader WebUI is available in [`examples/docker-compose.yml`](examples/docker-compose.yml). You can download and use it:

```bash
mkdir -p openreader-compose
cd openreader-compose
curl -O https://raw.githubusercontent.com/richardr1126/OpenReader-WebUI/main/examples/docker-compose.yml
docker compose up -d
```

Or add OpenReader WebUI to your existing `docker-compose.yml`:
```yaml
services:
  openreader-webui:
    container_name: openreader-webui
    image: ghcr.io/richardr1126/openreader-webui:latest
    environment:
      - API_BASE=http://host.docker.internal:8880/v1
    ports:
      - "3003:3003"
    volumes:
      - docstore:/app/docstore
    restart: unless-stopped

volumes:
  docstore:
```

## Dev Installation

### Prerequisites
- Node.js & npm or pnpm (recommended: use [nvm](https://github.com/nvm-sh/nvm) for Node.js)
Optionally required for different features:
- [FFmpeg](https://ffmpeg.org) (required for audiobook m4b creation only)
  - On Linux: `sudo apt install ffmpeg`
  - On MacOS: `brew install ffmpeg`
- [libreoffice](https://www.libreoffice.org) (required for DOCX files)
  - On Linux: `sudo apt install libreoffice`
  - On MacOS: `brew install libreoffice`

### Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/richardr1126/OpenReader-WebUI.git
   cd OpenReader-WebUI
   ```

2. Install dependencies:
   
   With pnpm (recommended):
   ```bash
   pnpm install
   ```
   
   Or with npm:
   ```bash
   npm install
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
   pnpm dev
   ```
   
   Or with npm:
   ```bash
   npm run dev
   ```

   or build and run the production server:
   
   With pnpm:
   ```bash
   pnpm build
   pnpm start
   ```
   
   Or with npm:
   ```bash
   npm run build
   npm start
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
- **Storage:** IndexedDB (in browser db store)
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
