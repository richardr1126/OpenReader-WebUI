---
title: OpenAI
---

Use OpenAI directly as an OpenAI-compatible TTS provider.

## OpenReader setup

1. In OpenReader settings, choose provider `OpenAI`.
2. Leave `API_BASE` unset unless you want to override the default `https://api.openai.com/v1`.
3. Set `API_KEY` to your OpenAI API key.
4. Choose model and voice.

## Notes

- `OpenAI` is a built-in provider in the dropdown, so `API_BASE` is usually not required.
- OpenReader routes TTS calls through its server API.
- For variable details, see [Environment Variables](../guides/environment-variables).
