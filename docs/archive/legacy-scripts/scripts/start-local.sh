#!/bin/bash
#
# Reliable Local Development Startup Script
# 
# Starts all ZIP services locally with proper error handling and prerequisite checks.
# Handles common issues like permission errors, port conflicts, and missing dependencies.
#
# Usage:
#   ./scripts/start-local.sh [frontend|bridge|all] [--fix-permissions]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log files
FRONTEND_LOG="/tmp/zip-frontend.log"
BRIDGE_LOG="/tmp/zip-bridge.log"

# PID files
FRONTEND_PID="/tmp/zip-frontend.pid"
BRIDGE_PID="/tmp/zip-bridge.pid"

# Function to print colored output
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
check_node_version() {
    if ! command_exists node; then
        error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js version 18+ required. Current: $(node -v)"
        exit 1
    fi
    
    success "Node.js version: $(node -v)"
}

# Check if dependencies are installed
check_dependencies() {
    if [ ! -d "node_modules" ]; then
        warning "node_modules not found. Installing dependencies..."
        npm install
        success "Dependencies installed"
    else
        success "Dependencies found"
    fi
}

# Check .env file
check_env_file() {
    if [ ! -f ".env" ]; then
        if [ -f "example-env" ]; then
            warning ".env file not found. Copying from example-env..."
            cp example-env .env
            warning "Please edit .env and add your OPENAI_API_KEY"
        else
            error ".env file not found and example-env not available"
            exit 1
        fi
    else
        success ".env file found"
    fi
}

# Fix permissions on .next directory
fix_permissions() {
    if [ -d ".next" ]; then
        CURRENT_OWNER=$(stat -c '%U' .next 2>/dev/null || stat -f '%Su' .next 2>/dev/null)
        CURRENT_USER=$(whoami)
        
        if [ "$CURRENT_OWNER" != "$CURRENT_USER" ]; then
            warning ".next directory owned by $CURRENT_OWNER, fixing permissions..."
            sudo chown -R "$CURRENT_USER:$CURRENT_USER" .next 2>/dev/null || {
                # If sudo fails, try removing and recreating
                warning "Could not change ownership, removing .next directory..."
                sudo rm -rf .next
                success "Removed .next directory (will be recreated on next build)"
            }
        fi
    fi
    
    # Also check data directory
    if [ -d "data" ]; then
        DATA_OWNER=$(stat -c '%U' data 2>/dev/null || stat -f '%Su' data 2>/dev/null)
        if [ "$DATA_OWNER" != "$(whoami)" ]; then
            warning "data directory owned by $DATA_OWNER, fixing permissions..."
            sudo chown -R "$(whoami):$(whoami)" data 2>/dev/null || true
        fi
    fi
}

# Check if port is available
check_port() {
    local port=$1
    local service=$2
    
    if lsof -ti:$port >/dev/null 2>&1; then
        warning "Port $port is already in use by another process"
        PID=$(lsof -ti:$port | head -1)
        PROCESS=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
        warning "  Process: $PROCESS (PID: $PID)"
        read -p "  Kill process and continue? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill -9 $PID 2>/dev/null || true
            sleep 1
            success "Killed process on port $port"
        else
            error "Cannot start $service: port $port is in use"
            exit 1
        fi
    fi
}

# Stop existing processes
stop_existing() {
    local service=$1
    
    if [ "$service" = "frontend" ] || [ "$service" = "all" ]; then
        if [ -f "$FRONTEND_PID" ]; then
            PID=$(cat "$FRONTEND_PID")
            if ps -p $PID >/dev/null 2>&1; then
                info "Stopping existing frontend (PID: $PID)..."
                kill $PID 2>/dev/null || true
                sleep 1
            fi
            rm -f "$FRONTEND_PID"
        fi
        pkill -f "next dev" 2>/dev/null || true
    fi
    
    if [ "$service" = "bridge" ] || [ "$service" = "all" ]; then
        if [ -f "$BRIDGE_PID" ]; then
            PID=$(cat "$BRIDGE_PID")
            if ps -p $PID >/dev/null 2>&1; then
                info "Stopping existing bridge (PID: $PID)..."
                kill $PID 2>/dev/null || true
                sleep 1
            fi
            rm -f "$BRIDGE_PID"
        fi
        pkill -f "zip-robot-bridge" 2>/dev/null || true
    fi
}

# Start frontend
start_frontend() {
    info "Starting Next.js frontend..."
    
    # Check port
    check_port 3000 "frontend"
    
    # Fix permissions if needed
    fix_permissions
    
    # Start frontend
    npm run dev:local > "$FRONTEND_LOG" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$FRONTEND_PID"
    
    # Wait for startup
    info "Waiting for frontend to start..."
    for i in {1..30}; do
        if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
            success "Frontend started (PID: $FRONTEND_PID)"
            success "Frontend available at: http://localhost:3000"
            return 0
        fi
        sleep 1
    done
    
    # Check if process is still running
    if ! ps -p $FRONTEND_PID >/dev/null 2>&1; then
        error "Frontend process died. Check logs: $FRONTEND_LOG"
        tail -20 "$FRONTEND_LOG"
        exit 1
    fi
    
    warning "Frontend may still be starting. Check logs: $FRONTEND_LOG"
    return 0
}

# Start bridge
start_bridge() {
    info "Starting robot bridge..."
    
    # Check ports
    check_port 8765 "bridge (WebSocket)"
    check_port 8766 "bridge (HTTP)"
    
    # Check bridge dependencies
    BRIDGE_DIR="robot/bridge/zip-robot-bridge"
    if [ ! -d "$BRIDGE_DIR" ]; then
        error "Bridge directory not found: $BRIDGE_DIR"
        exit 1
    fi
    
    if [ ! -d "$BRIDGE_DIR/node_modules" ]; then
        warning "Bridge dependencies not installed. Installing..."
        cd "$BRIDGE_DIR"
        npm install
        cd "$PROJECT_ROOT"
    fi
    
    # Start bridge
    cd "$BRIDGE_DIR"
    npm run dev:local > "$BRIDGE_LOG" 2>&1 &
    BRIDGE_PID=$!
    echo $BRIDGE_PID > "$BRIDGE_PID"
    cd "$PROJECT_ROOT"
    
    # Wait for startup
    info "Waiting for bridge to start..."
    for i in {1..20}; do
        if curl -s http://localhost:8766/health >/dev/null 2>&1; then
            success "Bridge started (PID: $BRIDGE_PID)"
            success "Bridge WebSocket: ws://localhost:8765/robot"
            success "Bridge HTTP: http://localhost:8766/health"
            return 0
        fi
        sleep 1
    done
    
    # Check if process is still running
    if ! ps -p $BRIDGE_PID >/dev/null 2>&1; then
        error "Bridge process died. Check logs: $BRIDGE_LOG"
        tail -20 "$BRIDGE_LOG"
        exit 1
    fi
    
    warning "Bridge may still be starting. Check logs: $BRIDGE_LOG"
    return 0
}

# Show status
show_status() {
    echo ""
    echo "=== Service Status ==="
    echo ""
    
    if [ -f "$FRONTEND_PID" ] && ps -p $(cat "$FRONTEND_PID") >/dev/null 2>&1; then
        success "Frontend: Running (PID: $(cat $FRONTEND_PID))"
        if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
            echo "  → http://localhost:3000"
        else
            warning "  → Not responding on port 3000"
        fi
    else
        error "Frontend: Not running"
    fi
    
    if [ -f "$BRIDGE_PID" ] && ps -p $(cat "$BRIDGE_PID") >/dev/null 2>&1; then
        success "Bridge: Running (PID: $(cat $BRIDGE_PID))"
        if curl -s http://localhost:8766/health >/dev/null 2>&1; then
            echo "  → ws://localhost:8765/robot"
            echo "  → http://localhost:8766/health"
        else
            warning "  → Not responding on port 8766"
        fi
    else
        error "Bridge: Not running"
    fi
    
    echo ""
    echo "Logs:"
    echo "  Frontend: $FRONTEND_LOG"
    echo "  Bridge: $BRIDGE_LOG"
    echo ""
}

# Stop all services
stop_all() {
    info "Stopping all services..."
    stop_existing "all"
    success "All services stopped"
}

# Main
SERVICE="${1:-all}"
FIX_PERMS="${2:-}"

case "$SERVICE" in
    frontend)
        check_node_version
        check_dependencies
        check_env_file
        if [ "$FIX_PERMS" = "--fix-permissions" ]; then
            fix_permissions
        fi
        stop_existing "frontend"
        start_frontend
        show_status
        ;;
    bridge)
        check_node_version
        check_dependencies
        stop_existing "bridge"
        start_bridge
        show_status
        ;;
    all)
        check_node_version
        check_dependencies
        check_env_file
        if [ "$FIX_PERMS" = "--fix-permissions" ]; then
            fix_permissions
        fi
        stop_existing "all"
        start_bridge
        sleep 2
        start_frontend
        show_status
        echo ""
        success "All services started!"
        echo ""
        echo "Access:"
        echo "  Frontend: http://localhost:3000"
        echo "  Bridge: ws://localhost:8765/robot"
        echo ""
        echo "To stop: ./scripts/start-local.sh stop"
        echo "To check status: ./scripts/start-local.sh status"
        ;;
    stop)
        stop_all
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 [frontend|bridge|all|stop|status] [--fix-permissions]"
        echo ""
        echo "Commands:"
        echo "  frontend  - Start only the Next.js frontend"
        echo "  bridge    - Start only the robot bridge"
        echo "  all       - Start both services (default)"
        echo "  stop      - Stop all services"
        echo "  status    - Show service status"
        echo ""
        echo "Options:"
        echo "  --fix-permissions  - Fix .next directory permissions (requires sudo)"
        exit 1
        ;;
esac
