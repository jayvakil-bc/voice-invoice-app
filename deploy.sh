#!/bin/bash

echo "🚀 Deploying Voice Invoice App..."

# Pull latest code
git pull origin main

# Stop existing containers
docker-compose -f docker-compose.prod.simple.yml down

# Remove old images to force rebuild
docker-compose -f docker-compose.prod.simple.yml rm -f

# Build and start services
docker-compose -f docker-compose.prod.simple.yml up -d --build

# Show running containers
docker-compose -f docker-compose.prod.simple.yml ps

echo "✅ Deployment complete!"
echo "📊 Check logs with: docker-compose -f docker-compose.prod.simple.yml logs -f"
