#!/bin/bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🚀 Starting Voice Invoice Backend..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Start backend
node server.js > logs/server.log 2>&1 &
SERVER_PID=$!

sleep 2

# Check if it's running
if ps -p $SERVER_PID > /dev/null; then
    echo "✅ Backend started (PID: $SERVER_PID)"
    echo ""
    echo "======================================"
    echo "🎉 Voice Invoice App Running!"
    echo "======================================"
    echo ""
    echo "🌐 Server: http://localhost:3000"
    echo "📊 Dashboard: http://localhost:3000/dashboard"
    echo "💚 Health: http://localhost:3000/api/health"
    echo ""
    echo "======================================"
    echo ""
    echo "To stop: ./stop.sh"
else
    echo "❌ Failed to start. Check logs/server.log"
    exit 1
fi
