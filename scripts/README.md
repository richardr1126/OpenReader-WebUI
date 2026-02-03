# OpenReader WebUI Scripts

Scripts for running OpenReader WebUI with Groq Orpheus TTS.

## Files

- `openreader-webui.sh` - Main startup script
- `.env` - Environment variables (contains `GROQ_API_KEY`)

## Usage

```bash
./openreader-webui.sh
```

## URL

http://localhost:3003

## Architecture

```text
OpenReader WebUI (:3003)
        ↓
Built-in /api/groq-tts route
        ↓
Groq API (canopylabs/orpheus-v1-english)
```

## API Endpoints

- `POST /api/groq-tts` - Generate speech from text
- `GET /api/groq-tts/voices` - List available voices

## Available Voices

- troy, austin, daniel (male)
- autumn, diana, hannah (female)
