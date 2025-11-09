#!/bin/bash

echo "🚀 Setting up Voice Invoice App on DigitalOcean"
echo "================================================"

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Install Docker Compose
echo "📦 Installing Docker Compose..."
apt install docker-compose -y

# Install git
echo "📦 Installing Git..."
apt install git -y

# Clone repository
echo "📥 Cloning repository..."
cd /root
git clone https://github.com/jayvakil-bc/voice-invoice-app.git
cd voice-invoice-app

# Create production .env file
echo "⚙️  Creating environment file..."
cat > .env << 'EOF'
AUTH_SERVICE_PORT=3001
USER_SERVICE_PORT=3002
INVOICE_SERVICE_PORT=3003
AUTH_SERVICE_URL=http://auth-service:3001
USER_SERVICE_URL=http://user-service:3002
INVOICE_SERVICE_URL=http://invoice-service:3003
MONGODB_URI=mongodb+srv://coccoccoc:coccoccoc@jayscluster.veogpzm.mongodb.net/?appName=jaysCluster
GOOGLE_CLIENT_ID=254197118235-cng6sq1120a83t1aq5gl9gpsnkgbt7q4.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
OPENAI_API_KEY=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
SESSION_SECRET=voice-invoice-super-secret-key-2025-random-string-xyz123
CLIENT_URL=http://159.203.36.203
NODE_ENV=production
EOF

# Start with Docker Compose
echo "🐳 Starting services with Docker Compose..."
docker-compose up -d

echo ""
echo "✅ Deployment complete!"
echo "🌐 Your app is now running at: http://159.203.36.203"
echo ""
echo "Useful commands:"
echo "  - View logs: docker-compose logs -f"
echo "  - Restart: docker-compose restart"
echo "  - Stop: docker-compose down"
echo "  - Update: git pull && docker-compose up -d --build"
