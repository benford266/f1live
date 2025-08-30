#!/bin/bash

echo "🔄 Restarting F1 Live Data containers..."

# Stop and remove containers
echo "Stopping containers..."
docker-compose down

# Rebuild and start
echo "Rebuilding and starting containers..."
docker-compose up --build -d

# Show logs
echo "Container status:"
docker-compose ps

echo ""
echo "To view logs, run:"
echo "  docker-compose logs -f"
echo "  docker-compose logs -f f1-backend"
echo "  docker-compose logs -f f1-frontend"