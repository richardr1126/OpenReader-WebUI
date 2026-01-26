#!/bin/bash
# OpenReader WebUI - TTS Document Reader
# URL: http://localhost:3003
# Uses Groq Orpheus TTS via local proxy

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load GROQ_API_KEY
source "$SCRIPT_DIR/.env"
export GROQ_API_KEY

# Stop existing services
lsof -ti:8880 | xargs -r kill -9 2>/dev/null || true
lsof -ti:3003 | xargs -r kill -9 2>/dev/null || true
sleep 1

# Start Groq TTS proxy (adds /voices endpoint for OpenReader)
nohup python3 "$SCRIPT_DIR/groq-tts-proxy.py" > /tmp/groq-proxy.log 2>&1 &
sleep 2

# Verify proxy is running
if ! curl -s http://localhost:8880/ > /dev/null; then
    echo "ERROR: Groq TTS proxy failed to start"
    exit 1
fi

# Build and run OpenReader WebUI
cd "$PROJECT_DIR"
pnpm install
pnpm build

# Set environment variables for the app
export API_KEY=none
export API_BASE=http://localhost:8880/v1

# Start the app
pnpm start &

echo "OpenReader WebUI started at http://localhost:3003"
echo "Groq TTS proxy running on port 8880"
echo "Available voices: troy, austin, daniel, autumn, diana, hannah"
