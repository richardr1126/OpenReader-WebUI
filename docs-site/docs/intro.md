---
id: intro
title: Introduction
slug: /
---

OpenReader WebUI is an open source text-to-speech document reader built with Next.js. It provides a read-along experience with narration for **EPUB, PDF, TXT, MD, and DOCX documents**.

It supports multiple TTS providers including OpenAI, DeepInfra, and custom OpenAI-compatible endpoints such as [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) and [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI).

## Highlights

- Multi-provider TTS support
  - [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) (including multi-voice combinations)
  - [Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)
  - Custom OpenAI-compatible endpoints (`/v1/audio/voices` and `/v1/audio/speech`)
  - Cloud providers such as [DeepInfra](https://deepinfra.com/models/text-to-speech) and [OpenAI API](https://platform.openai.com/docs/pricing#transcription-and-speech)
- Server-side sync and storage
  - External library import from a server-mounted folder
  - Sync documents between browser and server for multi-device use
- Server-side audiobook export in `m4b`/`mp3`, with resumable chapter-based export
- Read-along highlighting for PDF and EPUB
  - Optional word-by-word highlighting using server-side timestamps from [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- Sentence-aware narration that merges across pages/chapters for smoother playback
- Optimized Next.js TTS proxy with caching for faster repeat playback
- Customizable themes, TTS settings, and document handling

## Start Here

- [Docker Quick Start](./getting-started/docker-quick-start)
- [Local Development](./getting-started/local-development)
- [Environment Variables](./guides/environment-variables)
- [Auth](./guides/configuration)
- [SQL Database](./operations/database-and-migrations)
- [Object / Blob Storage](./guides/storage-and-blob-behavior)
- [TTS Providers](./guides/tts-providers)

## Source Repository

- GitHub: [richardr1126/OpenReader-WebUI](https://github.com/richardr1126/OpenReader-WebUI)
