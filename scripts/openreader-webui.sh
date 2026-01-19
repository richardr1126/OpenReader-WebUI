#!/bin/bash
# OpenReader WebUI - TTS Document Reader
# URL: https://reader.sunnymodi.com
# Uses Groq Orpheus TTS via local proxy

set -e

# Load GROQ_API_KEY
source /home/ec2-user/OpenReader-WebUI/scripts/.env
export GROQ_API_KEY

# Stop existing services
lsof -ti:8880 | xargs -r kill -9 2>/dev/null || true
docker stop openreader-webui 2>/dev/null || true
docker rm openreader-webui 2>/dev/null || true
sleep 1

# Start Groq TTS proxy (adds /voices endpoint for OpenReader)
nohup python3 /home/ec2-user/OpenReader-WebUI/scripts/groq-tts-proxy.py > /tmp/groq-proxy.log 2>&1 &
sleep 2

# Verify proxy is running
if ! curl -s http://localhost:8880/ > /dev/null; then
    echo "ERROR: Groq TTS proxy failed to start"
    exit 1
fi

# Run OpenReader WebUI
docker run --name openreader-webui \
  --restart unless-stopped \
  --add-host=host.docker.internal:host-gateway \
  -e API_KEY=none \
  -e API_BASE=http://host.docker.internal:8880/v1 \
  -p 3003:3003 \
  -v openreader_docstore:/app/docstore \
  -d \
  ghcr.io/richardr1126/openreader-webui:latest

echo "OpenReader WebUI started at https://reader.sunnymodi.com"
echo "Groq TTS proxy running on port 8880"
echo "Available voices: troy, austin, daniel, autumn, diana, hannah"
