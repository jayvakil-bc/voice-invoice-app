# VPS Deployment Guide

## Step 1: Create VPS (DigitalOcean Example)

1. Go to https://digitalocean.com
2. Create Droplet:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic ($6/month - 1GB RAM)
   - **Region**: Choose closest to you
   - **Authentication**: SSH Key (or Password)
3. Wait for droplet to be created, note the IP address

## Step 2: Initial Server Setup

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
```

Update system and install Docker:
```bash
# Update packages
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Verify installation
docker --version
docker-compose --version
```

## Step 3: Clone and Setup Project

```bash
# Install git if not present
apt install git -y

# Clone your repo
git clone https://github.com/jayvakil-bc/voice-invoice-app.git
cd voice-invoice-app

# Create production .env file
nano .env
```

Paste your environment variables:
```
NODE_ENV=production
MONGODB_URI=mongodb+srv://coccoccoc:coccoccoc@jayscluster.veogpzm.mongodb.net/?appName=jaysCluster
GOOGLE_CLIENT_ID=254197118235-cng6sq1120a83t1aq5gl9gpsnkgbt7q4.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
OPENAI_API_KEY=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
SESSION_SECRET=voice-invoice-super-secret-key-2025-random-string-xyz123
CLIENT_URL=http://YOUR_SERVER_IP
```

Save with `Ctrl+X`, then `Y`, then `Enter`

## Step 4: Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

## Step 5: Update Google OAuth

1. Go to https://console.cloud.google.com/apis/credentials
2. Click your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   ```
   http://YOUR_SERVER_IP/auth/google/callback
   ```
4. Add to **Authorized JavaScript origins**:
   ```
   http://YOUR_SERVER_IP
   ```
5. Click **Save**

## Step 6: Test

Visit: `http://YOUR_SERVER_IP`

## Useful Commands

```bash
# View logs
docker-compose -f docker-compose.prod.simple.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod.simple.yml logs -f api-gateway

# Restart services
docker-compose -f docker-compose.prod.simple.yml restart

# Stop everything
docker-compose -f docker-compose.prod.simple.yml down

# Redeploy (pull latest code and rebuild)
./deploy.sh
```

## Optional: Add Domain & HTTPS

If you have a domain (e.g., invoice.yourdomain.com):

1. Point your domain's A record to your server IP
2. Install Nginx and Certbot:
   ```bash
   apt install nginx certbot python3-certbot-nginx -y
   ```
3. Configure Nginx as reverse proxy and get SSL certificate
4. Update CLIENT_URL to use your domain

---

**Total Cost**: ~$6/month for VPS + Your existing MongoDB Atlas free tier
