#!/bin/bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🚀 Starting Microservices Architecture"
echo "======================================"

# Install dependencies for all services
echo ""
echo "📦 Installing dependencies..."

(cd services/auth-service && npm install)
(cd services/user-service && npm install)
(cd services/invoice-service && npm install)
(cd api-gateway && npm install)

echo ""
echo "✅ Dependencies installed"
echo ""
echo "Starting services..."
echo ""

# Create logs directory
mkdir -p logs

# Start all services in background
(cd services/auth-service && npm start > ../../logs/auth-service.log 2>&1 &)
AUTH_PID=$!
echo "✓ Auth Service (PID: $AUTH_PID) - http://localhost:3001"

sleep 1

(cd services/user-service && npm start > ../../logs/user-service.log 2>&1 &)
USER_PID=$!
echo "✓ User Service (PID: $USER_PID) - http://localhost:3002"

sleep 1

(cd services/invoice-service && npm start > ../../logs/invoice-service.log 2>&1 &)
INVOICE_PID=$!
echo "✓ Invoice Service (PID: $INVOICE_PID) - http://localhost:3003"

sleep 1

(cd api-gateway && npm start > ../logs/api-gateway.log 2>&1 &)
GATEWAY_PID=$!
echo "✓ API Gateway (PID: $GATEWAY_PID) - http://localhost:3000"

echo ""
echo "======================================"
echo "🎉 All services started!"
echo ""
echo "Access your app at: http://localhost:3000"
echo ""
echo "Service URLs:"
echo "  - API Gateway:     http://localhost:3000"
echo "  - Auth Service:    http://localhost:3001"
echo "  - User Service:    http://localhost:3002"
echo "  - Invoice Service: http://localhost:3003"
echo ""
echo "Health Check: http://localhost:3000/api/health"
echo ""
echo "Logs are in ./logs/ directory"
echo ""
echo "To stop all services, run: ./stop-services.sh"
echo ""

# Save PIDs
echo "$AUTH_PID $USER_PID $INVOICE_PID $GATEWAY_PID" > .service-pids

# Wait for user to press Ctrl+C
trap "echo ''; echo 'Stopping services...'; ./stop-services.sh; exit" INT
echo "Press Ctrl+C to stop all services"
wait
