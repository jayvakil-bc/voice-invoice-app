#!/bin/bash

# Deployment script for VPS
VPS_IP="159.203.36.203"
VPS_USER="root"
APP_DIR="/root/voice-invoice-app"

echo "🚀 Deploying to VPS ($VPS_IP)..."

# Step 1: SSH and prepare directory
echo "📁 Step 1: Preparing VPS directory..."
ssh $VPS_USER@$VPS_IP << 'ENDSSH'
    # Stop any running node processes
    pkill -f "node.*server.js" 2>/dev/null || true
    
    # Create app directory if it doesn't exist
    mkdir -p /root/voice-invoice-app
    
    # Backup old code if exists
    if [ -d "/root/voice-invoice-app/.git" ]; then
        echo "📦 Backing up existing deployment..."
        cd /root/voice-invoice-app
        git stash
    fi
ENDSSH

# Step 2: Push code to VPS
echo "📤 Step 2: Pushing code to VPS..."
git push origin monolithic-refactor

# Step 3: Pull on VPS and install
echo "📥 Step 3: Pulling and installing on VPS..."
ssh $VPS_USER@$VPS_IP << 'ENDSSH'
    cd /root/voice-invoice-app
    
    # Clone or pull
    if [ ! -d ".git" ]; then
        cd /root
        rm -rf voice-invoice-app
        git clone https://github.com/jayvakil-bc/voice-invoice-app.git
        cd voice-invoice-app
    fi
    
    # Switch to monolithic branch
    git fetch origin
    git checkout monolithic-refactor
    git pull origin monolithic-refactor
    
    # Install nvm if not present
    if [ ! -d "$HOME/.nvm" ]; then
        echo "📦 Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    fi
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    # Install Node.js 18
    nvm install 18
    nvm use 18
    
    # Install dependencies
    npm install
    
    # Create logs directory
    mkdir -p logs
    
    echo "✅ Code deployed and dependencies installed"
ENDSSH

# Step 4: Copy .env file
echo "🔐 Step 4: Copying environment variables..."
echo "You need to manually set up .env on VPS"
echo "Run: ssh $VPS_USER@$VPS_IP"
echo "Then create /root/voice-invoice-app/.env with your credentials"

echo ""
echo "✅ Deployment prepared!"
echo "Next steps:"
echo "1. SSH to VPS: ssh $VPS_USER@$VPS_IP"
echo "2. Create .env file in /root/voice-invoice-app/"
echo "3. Start server: cd /root/voice-invoice-app && ./start.sh"
echo "4. Check logs: tail -f /root/voice-invoice-app/logs/server.log"

