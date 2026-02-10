---
title: Kokoro-FastAPI
---

You can run the Kokoro TTS API server directly with Docker.

:::warning
For Kokoro issues and support, use the upstream repository: [remsky/Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI).
:::

## CPU image

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

## GPU image

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

## OpenReader integration notes

- In OpenReader settings, choose provider `Custom OpenAI-Like` and model `Kokoro`.
- Set OpenReader `API_BASE` to your Kokoro endpoint (for Docker Compose, commonly `http://kokoro-tts:8880/v1`).
- `API_BASE` is needed here because Kokoro is used via the custom provider path, not a built-in provider endpoint.
- GPU mode requires NVIDIA Docker support and is best on NVIDIA hardware.
- CPU mode works best on Apple Silicon or modern x86 CPUs.
