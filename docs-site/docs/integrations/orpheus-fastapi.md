---
title: Orpheus-FastAPI
---

Use Orpheus-FastAPI as an OpenAI-compatible TTS backend for OpenReader.

## Upstream project

- [Lex-au/Orpheus-FastAPI](https://github.com/Lex-au/Orpheus-FastAPI)

## OpenReader setup

1. Start your Orpheus-FastAPI server.
2. In OpenReader settings, choose provider `Custom OpenAI-Like` and model `Orpheus`.
3. Set OpenReader `API_BASE` to your Orpheus base URL (typically ending with `/v1`).
4. Set `API_KEY` if your Orpheus deployment requires one.
5. Choose voice.

## Notes

- `API_BASE` is needed here because Orpheus is configured through the custom provider path.
- OpenReader expects OpenAI-compatible audio endpoints.
- For variable details, see [Environment Variables](../guides/environment-variables).
