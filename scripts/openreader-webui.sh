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
fuser -k 8880/tcp 2>/dev/null || true
fuser -k 3003/tcp 2>/dev/null || true

# Wait for ports to be released
for i in {1..10}; do
    if ! fuser 3003/tcp 2>/dev/null; then
        break
    fi
    echo "Waiting for port 3003 to be released..."
    sleep 1
done

# Final check
if fuser 3003/tcp 2>/dev/null; then
    echo "ERROR: Port 3003 still in use after 10 seconds"
    exit 1
fi

# Start Groq TTS proxy (adds /voices endpoint for OpenReader)
nohup python3 "$SCRIPT_DIR/groq-tts-proxy.py" > /tmp/groq-proxy.log 2>&1 &
disown
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
nohup pnpm start > /tmp/openreader.log 2>&1 &
disown

echo "OpenReader WebUI started at http://localhost:3003"
echo "Groq TTS proxy running on port 8880"
echo "Available voices: troy, austin, daniel, autumn, diana, hannah"
echo "Logs: /tmp/openreader.log and /tmp/groq-proxy.log"
