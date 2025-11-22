#!/bin/bash

echo "🛑 Stopping backend..."

# Find and kill the server process
pkill -f "node.*server.js" 2>/dev/null

# Also kill any node processes running the server
ps aux | grep "[s]erver.js" | awk '{print $2}' | xargs kill -9 2>/dev/null

sleep 1

echo "✅ Backend stopped"
