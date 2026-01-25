#!/bin/sh
set -e

# Run migrations if we have the SQLite file path set or default
if [ -z "$POSTGRES_URL" ]; then
  echo "Running SQLite migrations..."
  npx @better-auth/cli migrate -y
fi

# Start the application
exec "$@"
