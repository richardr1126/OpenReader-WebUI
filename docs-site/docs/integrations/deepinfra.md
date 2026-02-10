---
title: Deepinfra
---

Use Deepinfra as a hosted OpenAI-compatible TTS provider.

## OpenReader setup

1. In OpenReader settings, choose provider `Deepinfra`.
2. Leave `API_BASE` unset unless you want to override the default endpoint.
   - Default value: `https://api.deepinfra.com/v1/openai`
3. Set `API_KEY` to your Deepinfra API key if needed.
4. Choose model and voice.

## Notes

- `Deepinfra` is a built-in provider in the dropdown, so `API_BASE` is usually not required.
- Deepinfra supports multiple TTS models, including Kokoro-family options.
- For variable details, see [Environment Variables](../guides/environment-variables).
