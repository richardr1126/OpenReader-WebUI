# OpenReader WebUI Setup Guide

Document reader with high-quality text-to-speech using Groq's Orpheus TTS.

**URL:** http://localhost:3003

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  OpenReader WebUI   │────▶│  Groq TTS Proxy  │────▶│   Groq API      │
│  (Docker :3003)     │     │  (Python :8880)  │     │   (Orpheus)     │
└─────────────────────┘     └──────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────────┐
│  nginx (SSL :443)   │
│  your-domain.com
└─────────────────────┘
```

## Components

| Component | Location | Port | Purpose |
|-----------|----------|------|---------|
| OpenReader WebUI | Docker container | 3003 | PDF/EPUB reader UI |
| Groq TTS Proxy | `scripts/groq-tts-proxy.py` | 8880 | Adds `/voices` endpoint, proxies to Groq |
| nginx | `/etc/nginx/conf.d/openreader.conf` | 443 | SSL termination, reverse proxy |

## Files

```
scripts/
├── openreader-webui.sh      # Startup script (run this to start everything)
├── groq-tts-proxy.py        # Python proxy server for Groq TTS
├── .env                     # Contains GROQ_API_KEY
└── OPENREADER_SETUP.md      # This file
```

## Quick Start

### Start Services
```bash
./scripts/openreader-webui.sh
```

### Check Status
```bash
# Check if proxy is running
curl http://localhost:8880/v1/audio/voices

# Check if container is running
docker ps | grep openreader

# Check proxy logs
cat /tmp/groq-proxy.log

# Check container logs
docker logs openreader-webui --tail 50
```

### Stop Services
```bash
# Stop container
docker stop openreader-webui

# Stop proxy
pkill -f groq-tts-proxy.py
```

## Configuration

### Environment Variable
Create a `.env` file in the `scripts/` directory:
```
GROQ_API_KEY=gsk_xxxxx
```

### Available Voices
Groq Orpheus supports 6 voices:
- **Male:** troy, austin, daniel
- **Female:** autumn, diana, hannah

### TTS Model
- Model: `canopylabs/orpheus-v1-english`
- Output: WAV audio, 24kHz, 16-bit mono

## nginx Configuration

File: `/etc/nginx/conf.d/openreader.conf`

```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

## Groq TTS Proxy

The proxy (`groq-tts-proxy.py`) serves two purposes:

1. **Provides `/v1/audio/voices` endpoint** - OpenReader needs this to populate the voice dropdown, but Groq doesn't have this endpoint
2. **Proxies TTS requests** - Forwards `/v1/audio/speech` requests to Groq with correct model name and response format

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/v1/audio/voices` | GET | Returns available voices |
| `/v1/audio/speech` | POST | Generates speech audio |

### Request Example
```bash
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "Hello world", "voice": "troy"}' \
  -o output.wav
```

## Docker Container

### Image
`ghcr.io/richardr1126/openreader-webui:latest`

### Volume
Documents are stored in Docker volume `openreader_docstore` mounted at `/app/docstore`

### Environment Variables
| Variable | Value | Description |
|----------|-------|-------------|
| `API_KEY` | `none` | Not needed (proxy handles auth) |
| `API_BASE` | `http://host.docker.internal:8880/v1` | Points to local proxy |

## Troubleshooting

### Voices not showing in dropdown
```bash
# Check proxy is running
curl http://localhost:8880/v1/audio/voices

# If not running, restart
./scripts/openreader-webui.sh
```

### TTS not working / Server not responding
```bash
# Test proxy directly
curl -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input": "test", "voice": "troy"}' \
  -o /tmp/test.wav

# Check if valid audio
file /tmp/test.wav
# Should show: RIFF (little-endian) data, WAVE audio...
```

### Document not loading (stuck on spinner)
The document may have been deleted when the container was recreated. Re-upload the file.

### Port 8880 already in use
```bash
lsof -ti:8880 | xargs -r kill -9
```

### SSL certificate renewal
Certbot auto-renews. Manual renewal:
```bash
sudo certbot renew
```

## Supported File Types

- PDF
- EPUB
- TXT
- MD (Markdown)
- DOCX

## Limitations

- Groq Orpheus has a **200 character limit** per TTS request
- OpenReader handles chunking automatically
- Only English voice model available via Groq (Arabic Saudi dialect also available)

## Links

- [OpenReader WebUI GitHub](https://github.com/richardr1126/OpenReader-WebUI)
- [Groq Orpheus TTS Docs](https://console.groq.com/docs/text-to-speech/orpheus)
- [Groq Console](https://console.groq.com)
