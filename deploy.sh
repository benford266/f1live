#!/bin/bash

# F1 Live Data Visualization Deployment Script

set -e

echo "🏎️  F1 Live Data Visualization Deployment"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    print_error "docker-compose is not installed. Please install docker-compose and try again."
    exit 1
fi

print_status "Stopping existing containers..."
docker-compose down

print_status "Building and starting containers..."
docker-compose up --build -d

print_status "Waiting for services to be healthy..."
sleep 10

# Check backend health
print_status "Checking backend health..."
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    print_success "Backend is healthy! ✅"
else
    print_warning "Backend health check failed. Check logs with: docker-compose logs f1-backend"
fi

# Check frontend
print_status "Checking frontend..."
if curl -f http://localhost > /dev/null 2>&1; then
    print_success "Frontend is running! ✅"
else
    print_warning "Frontend check failed. Check logs with: docker-compose logs f1-frontend"
fi

print_success "Deployment complete! 🎉"
echo ""
echo "Services:"
echo "- Frontend: http://localhost"
echo "- Backend:  http://localhost:3001"
echo ""
echo "Useful commands:"
echo "- View logs: docker-compose logs -f"
echo "- Stop: docker-compose down"
echo "- Restart: docker-compose restart"
echo "- View status: docker-compose ps"