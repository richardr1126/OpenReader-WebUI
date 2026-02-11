---
title: TTS Providers
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

OpenReader WebUI supports OpenAI-compatible TTS providers through a common API shape.

:::tip
If you are running a self-hosted TTS server (Kokoro/Orpheus/etc.), use **Custom OpenAI-Like** in Settings.
:::

## Quick Setup by Provider

<Tabs groupId="tts-provider-setup">
  <TabItem value="openai" label="OpenAI" default>

1. In Settings, choose provider: `OpenAI`.
2. Keep the default `API_BASE` (auto-filled).
3. Set `API_KEY` to your OpenAI key.
4. Choose model/voice.

  </TabItem>
  <TabItem value="deepinfra" label="DeepInfra">

1. In Settings, choose provider: `Deepinfra`.
2. Keep the default `API_BASE` (auto-filled).
3. Set `API_KEY` to your DeepInfra key.
4. Choose model/voice.

  </TabItem>
  <TabItem value="custom" label="Custom OpenAI-Like">

1. In Settings, choose provider: `Custom OpenAI-Like`.
2. Set `API_BASE` to your endpoint (example: `http://host.docker.internal:8880/v1`).
3. Set `API_KEY` if your provider requires one.
4. Choose model/voice.

  </TabItem>
</Tabs>

## Provider Dropdown Behavior

In Settings, provider options include:

- `OpenAI`
- `Deepinfra`
- `Custom OpenAI-Like` (Kokoro, Orpheus, and other OpenAI-compatible endpoints)

`API_BASE` guidance:

- `OpenAI` and `Deepinfra` auto-fill default endpoints.
- `Custom OpenAI-Like` requires setting `API_BASE` manually.

:::info OpenAI-Compatible API Shape
Custom providers should expose:

- `GET /v1/audio/voices`
- `POST /v1/audio/speech`
:::

:::warning Server-Reachable API Base
TTS requests are sent from the Next.js server, not directly from the browser. `API_BASE` must be reachable from the server runtime.
:::

## Related Guides

- [Environment Variables](../reference/environment-variables)
- [TTS Rate Limiting](./tts-rate-limiting)
- [Auth](./auth)
- [Kokoro-FastAPI](../integrations/kokoro-fastapi)
- [Orpheus-FastAPI](../integrations/orpheus-fastapi)
- [Deepinfra](../integrations/deepinfra)
- [OpenAI](../integrations/openai)
- [Custom OpenAI](../integrations/custom-openai)
