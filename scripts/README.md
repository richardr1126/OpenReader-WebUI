# OpenReader WebUI Scripts

Scripts for running OpenReader WebUI with Groq Orpheus TTS.

## Files

- `openreader-webui.sh` - Main startup script
- `groq-tts-proxy.py` - FastAPI proxy that adds `/v1/audio/voices` endpoint for Groq
- `.env` - Environment variables (contains `GROQ_API_KEY`)

## Usage

```bash
./openreader-webui.sh
```

## URL

http://localhost:3003

## Architecture

```
OpenReader WebUI (Docker :3003)
        ↓
Groq TTS Proxy (localhost:8880)
        ↓
Groq API (canopylabs/orpheus-v1-english)
```

## Available Voices

- troy, austin, daniel (male)
- autumn, diana, hannah (female)
