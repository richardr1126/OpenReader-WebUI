#!/bin/bash
# OpenReader WebUI - TTS Document Reader
# URL: http://localhost:3003
# Uses Groq Orpheus TTS via built-in /api/groq-tts route

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load GROQ_API_KEY
source "$SCRIPT_DIR/.env"
export GROQ_API_KEY

# Stop existing service
fuser -k 3003/tcp 2>/dev/null || true

# Wait for port to be released
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

# Build and run OpenReader WebUI
cd "$PROJECT_DIR"
pnpm install
pnpm build

# Start the app
nohup pnpm start > /tmp/openreader.log 2>&1 &
disown

echo "OpenReader WebUI started at http://localhost:3003"
echo "Groq TTS available at /api/groq-tts"
echo "Available voices: troy, austin, daniel, autumn, diana, hannah"
echo "Logs: /tmp/openreader.log"
