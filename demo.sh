#!/bin/bash

# Dev Skin - Demo Script
# This script demonstrates how to run the entire Dev Skin stack in development mode

set -e  # Exit on error

echo "🚀 Dev Skin - Starting Development Stack"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo -e "${BLUE}📦 Step 1: Installing dependencies...${NC}"
npm run bootstrap
echo ""

# Check if .env file exists for adapter configuration
if [ ! -f .env ] && [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  Warning: OPENAI_API_KEY not set.${NC}"
    echo "   The adapter service requires an OpenAI API key to function."
    echo "   You can either:"
    echo "   1. Set OPENAI_API_KEY environment variable"
    echo "   2. Create a .env file with: OPENAI_API_KEY=your-key-here"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}🔧 Step 2: Starting services...${NC}"
echo ""
echo "The following services will start:"
echo "  • Renderer (Vite dev server) - http://localhost:5173"
echo "  • Adapter service - http://localhost:8000"
echo "  • MCP server - http://localhost:8001"
echo "  • Electron app (will launch automatically)"
echo ""
echo -e "${GREEN}Starting all services...${NC}"
echo ""

# Start all services using npm script
npm run start:dev

# Note: The script will continue running until you press Ctrl+C
# All services run in the background via concurrently

