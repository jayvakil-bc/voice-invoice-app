#!/bin/bash
# Stop the server

cd "$(dirname "$0")"

# Find and kill process on port 3000
PID=$(lsof -ti:3000 2>/dev/null)

if [ -z "$PID" ]; then
    echo "ℹ️  No server running on port 3000"
    exit 0
fi

echo "🛑 Stopping server (PID: $PID)..."
kill -9 $PID 2>/dev/null

# Wait a moment and verify
sleep 1
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "❌ Failed to stop server"
    exit 1
else
    echo "✅ Server stopped successfully"
fi
