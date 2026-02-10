---
title: Custom OpenAI
---

Use any custom OpenAI-compatible TTS service with OpenReader.

Use this integration when your endpoint is not directly covered by built-in dropdown defaults.

## Compatibility requirements

Your provider should expose:

- `GET /v1/audio/voices`
- `POST /v1/audio/speech`

## OpenReader setup

1. In OpenReader settings, choose provider `Custom OpenAI-Like`.
2. Pick model `Kokoro`, `Orpheus`, or `Other` as appropriate.
3. Set `API_BASE` to your service base URL.
4. Set `API_KEY` if required by your service.
5. Choose voice.

## Notes

- `API_BASE` is required for this provider path because OpenReader cannot infer your custom host.
- If voices do not load, verify the `/v1/audio/voices` response format.
- For variable details, see [Environment Variables](../guides/environment-variables).
