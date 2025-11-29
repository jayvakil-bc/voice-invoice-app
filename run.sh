#!/bin/bash
# Auto-run script: stops existing server and starts a new one

cd "$(dirname "$0")"

echo "🔄 Auto-running server..."

# Stop any existing server on port 3000
PID=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$PID" ]; then
    echo "🛑 Stopping existing server (PID: $PID)..."
    kill -9 $PID 2>/dev/null
    sleep 1
fi

# Start the server
echo "🚀 Starting server..."
node server.js

