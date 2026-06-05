#!/bin/bash
# Build verification script for local development (Unix/Linux/macOS)
# Verifies TypeScript compilation and production builds for both services

set -e  # Exit on error

echo "🔨 Building ZIP Application Services Locally"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error
error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to print warning
warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    error "Must be run from project root directory"
    exit 1
fi

# Phase 1: ZIP App TypeScript Check
echo "Phase 1: ZIP App TypeScript Compilation"
echo "----------------------------------------"
if npm run typecheck; then
    success "ZIP app TypeScript compilation passed"
else
    error "ZIP app TypeScript compilation failed"
    exit 1
fi
echo ""

# Phase 2: Robot Bridge TypeScript Check
echo "Phase 2: Robot Bridge TypeScript Compilation"
echo "---------------------------------------------"
cd robot/bridge/zip-robot-bridge
if npm run typecheck; then
    success "Robot bridge TypeScript compilation passed"
else
    error "Robot bridge TypeScript compilation failed"
    exit 1
fi
cd ../../..
echo ""

# Phase 3: ZIP App Production Build
echo "Phase 3: ZIP App Production Build"
echo "----------------------------------"
if npm run build:local; then
    success "ZIP app production build completed"
else
    error "ZIP app production build failed"
    exit 1
fi
echo ""

# Phase 4: Robot Bridge Production Build
echo "Phase 4: Robot Bridge Production Build"
echo "--------------------------------------"
cd robot/bridge/zip-robot-bridge
if npm run build:local; then
    success "Robot bridge production build completed"
else
    error "Robot bridge production build failed"
    exit 1
fi
cd ../../..
echo ""

# Summary
echo "============================================"
success "All builds completed successfully!"
echo ""
echo "Next steps:"
echo "  1. Start robot bridge: npm run dev:bridge"
echo "  2. Start ZIP app: npm run dev:local"
echo "  3. Or run production builds:"
echo "     - Robot bridge: cd robot/bridge/zip-robot-bridge && npm start"
echo "     - ZIP app: npm start"
echo ""

