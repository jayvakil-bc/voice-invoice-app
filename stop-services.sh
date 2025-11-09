#!/bin/bash

echo "🛑 Stopping all microservices..."

if [ -f .service-pids ]; then
    PIDS=$(cat .service-pids)
    for PID in $PIDS; do
        if kill -0 $PID 2>/dev/null; then
            echo "Stopping process $PID"
            kill $PID
        fi
    done
    rm .service-pids
fi

# Also kill by port
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:3002 | xargs kill -9 2>/dev/null
lsof -ti:3003 | xargs kill -9 2>/dev/null

echo "✅ All services stopped"
