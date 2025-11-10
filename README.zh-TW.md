# 📘 OpenReader-WebUI（繁體中文說明）

> 本文件為 [README.md](./README.md) 的繁體中文翻譯，僅供參考。若有版本差異，請以原始英文文件為準。

[![GitHub Stars](https://img.shields.io/github/stars/richardr1126/OpenReader-WebUI)](../../stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/richardr1126/OpenReader-WebUI)](../../network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/richardr1126/OpenReader-WebUI)](../../watchers)
[![GitHub Issues](https://img.shields.io/github/issues/richardr1126/OpenReader-WebUI)](../../issues)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/richardr1126/OpenReader-WebUI)](../../commits)
[![GitHub Release](https://img.shields.io/github/v/release/richardr1126/OpenReader-WebUI)](../../releases)

[![問題討論區](https://img.shields.io/badge/Discussions-Ask%20a%20Question-blue)](../../discussions)

# OpenReader WebUI 📄🔊

OpenReader WebUI 是一個可以靈活運用搭配 TTS 的閱讀器，目前OpenReader WebUI 能夠讀取的文件格式包括 EPUB, PDF, TXT, MD, 以及 DOCX，並且支援多種TTS供應端，包含了： OpenAI, Deepinfra, 以及 OpenAI相容的 [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) 和 [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)

- 🎯 **支援眾多的TTS供應端**:

  - **OpenAI**: tts-1, tts-1-hd, gpt-4o-mini-tts models with voices (alloy, echo, fable, onyx, nova, shimmer)
  - **Deepinfra**: Kokoro-82M, Orpheus-3B, Sesame-1B models with extensive voice libraries
  - **Custom OpenAI-Compatible**: Any OpenAI-compatible endpoint with custom voice sets
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

### 🛠️ 目前持續努力中的功能
- [ ] **能夠支援原生 .docx ** (目前至少需要安裝 libreoffice)
- [ ] **改善無障礙操作

## 🐳 Docker 快速安裝


### 運作需求
- 安裝最新版本的Docker
- 至少需要有一個 TTS API server (Kokoro-FastAPI, Orpheus-FastAPI, Deepinfra, OpenAI, 等) 在運作中，而且讀的到。

### 1. 🐳 新增 Docker 容器:
  ```bash
  docker run --name openreader-webui \
    -p 3003:3003 \
    -v openreader_docstore:/app/docstore \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  (選擇性設定屬性): 設定 TTS `API_BASE` 調用網址 或是 `API_KEY` 作為整體預設值

  ```bash
  docker run --name openreader-webui \
    -e API_KEY=none \
    -e API_BASE=http://host.docker.internal:8880/v1 \
    -p 3003:3003 \
    -v openreader_docstore:/app/docstore \
    ghcr.io/richardr1126/openreader-webui:latest
  ```

  > **Note:** 因為從 TTS API 調用音訊的操作會在 Next.js 伺服器端，而不是在客戶端。所以，TTS API 的網址應該要可以訪問，並且相依於 Next.js 伺服器。另外，如果 Next.js 伺服器位於 Docker 容器中，建議您使用 `host.docker.internal` 來存取主機，而不是 `localhost`。.

  開啟 [http://localhost:3003](http://localhost:3003) 來運作程式以及完成後續的設定.

  > **Note:** `openreader_docstore` 是用來儲存伺服器端文件的。您可以掛載本機目錄來代替。如果您不需要伺服器端文檔，也可以將其刪除。

  ### 2. ⚙️ 在網頁界面中設定各項屬性:
  - 在Settings modal中設定TTS 供應端
  - 如果需要的話，設定 TTS API 網址 和 API Key (當然，如果是在環境設定時就進行會比較安全）
  - 從下拉式選單選取要使用的聲音模型 (會顯示從 TTS 供應端 API獲取的聲音列表)

### 3. ⬆️ 更新 Docker 的映像檔
```bash
docker stop openreader-webui && \
docker rm openreader-webui && \
docker pull ghcr.io/richardr1126/openreader-webui:latest
```

### (選擇性) 🐳 設定 Docker Compose 和 Kokoro-FastAPI

提供使用 Kokoro-FastAPI 搭配 OpenReader WebUI的docker-compose 範例檔案，放在 [`examples/docker-compose.yml`](examples/docker-compose.yml):

```bash
mkdir -p openreader-compose
cd openreader-compose
curl -O https://raw.githubusercontent.com/richardr1126/OpenReader-WebUI/main/examples/docker-compose.yml
docker compose up -d
```

或是把 OpenReader WebUI 加入你的 `docker-compose.yml`:
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
## 開發中版本安裝

### 運作需求
- Node.js & npm

### 運作需求
- Node.js & npm or pnpm (recommended: use [nvm](https://github.com/nvm-sh/nvm) for Node.js)
Optionally required for different features:
- [FFmpeg](https://ffmpeg.org) (required for audiobook m4b creation only)
  - On Linux: `sudo apt install ffmpeg`
  - On MacOS: `brew install ffmpeg`
- [libreoffice](https://www.libreoffice.org) (required for DOCX files)
  - On Linux: `sudo apt install libreoffice`
  - On MacOS: `brew install libreoffice`

### 步驟

1. 複製程式碼庫:
   ```bash
   git clone https://github.com/richardr1126/OpenReader-WebUI.git
   cd OpenReader-WebUI
   ```

2. 安裝套件:
   
   With pnpm (recommended):
   ```bash
   pnpm install
   ```
   
   Or with npm:
   ```bash
   npm install
   ```

3. 環境設定:
   ```bash
   cp template.env .env
   # Edit .env with your configuration settings
   ```
   > Note: The base URL for the TTS API should be accessible and relative to the Next.js server

4. 啟動開發伺服器:
   
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

   訪問 [http://localhost:3003](http://localhost:3003) 來運作程式.




## 💡 新功能請求


如果你有新功能的需求或是新點子，可以經由討論區提出 [討論區](https://github.com/richardr1126/OpenReader-WebUI/discussions) tab.

## 🙋‍♂️ 支持與問題

如果你遇到問題，請使用GitHub的格式提出問題（非常簡單的格式）。


## 👥 協力

非常歡迎各方人仕協助! 提交您的修改吧！



## ❤️ 感謝

沒有站在這些巨人的肩膀上，這個專案是不可能完成的！:

- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) model
- [Orpheus-TTS](https://huggingface.co/collections/canopylabs/orpheus-tts-67d9ea3f6c05a941c06ad9d2) model
- [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)
- [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)
- [react-pdf](https://github.com/wojtekmaj/react-pdf) npm package
- [react-reader](https://github.com/happyr/react-reader) npm package

## Docker 支援架構
- linux/amd64 (x86_64)
- linux/arm64 (Apple Silicon, Raspberry Pi, SBCs, etc.)

## Stack

- **架構:** Next.js (React)
- **容器化:** Docker
- **資料庫:** IndexedDB (in browser db store)
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

## 授權方式

本專案採用 MIT 授權方式。