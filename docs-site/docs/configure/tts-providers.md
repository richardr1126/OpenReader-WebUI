---
title: TTS Providers
---

OpenReader WebUI supports OpenAI-compatible TTS providers through a common API shape.

## Supported provider patterns

- OpenAI API
- DeepInfra
- Kokoro-FastAPI
- Orpheus-FastAPI
- Custom OpenAI-compatible endpoints

## Provider dropdown behavior

In Settings, the provider dropdown includes:

- `OpenAI`
- `Deepinfra`
- `Custom OpenAI-Like` (for Kokoro, Orpheus, and other compatible endpoints)

`API_BASE` guidance:

- For `OpenAI` and `Deepinfra`, OpenReader auto-fills the default endpoint.
- For `Custom OpenAI-Like`, set `API_BASE` to your server endpoint.
- In practice, you usually only set `API_BASE` when using a provider/endpoint that is not directly covered by the built-in dropdown defaults.

## Custom provider compatibility

For custom providers, OpenReader expects these endpoints:

- `GET /v1/audio/voices`
- `POST /v1/audio/speech`

If your provider exposes this interface, it can be used as an OpenAI-compatible TTS backend.

## Setup flow

1. Select your provider in the OpenReader Settings modal.
2. If using `Custom OpenAI-Like` (or overriding a default), set `API_BASE`.
3. Set `API_KEY` if required by your provider.
4. Choose model and voice.

For environment variables, see [Environment Variables](../reference/environment-variables).
For TTS quota behavior, see [TTS Rate Limiting](./tts-rate-limiting).
For auth behavior, see [Auth](./configuration).
For provider-specific integration guides, see [Kokoro-FastAPI](../integrations/kokoro-fastapi), [Orpheus-FastAPI](../integrations/orpheus-fastapi), [Deepinfra](../integrations/deepinfra), [OpenAI](../integrations/openai), and [Custom OpenAI](../integrations/custom-openai).
