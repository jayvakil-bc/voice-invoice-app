#!/bin/bash
# Start the server

cd "$(dirname "$0")"

# Check if server is already running
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "❌ Server is already running on port 3000"
    echo "   Use 'npm run stop' or './stop.sh' to stop it first"
    exit 1
fi

echo "🚀 Starting server..."
npm start
