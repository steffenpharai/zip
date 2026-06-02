#!/bin/bash
#
# Quick diagnostic script to check why localhost:3000 might not be accessible
#

echo "=== ZIP Frontend Access Diagnostic ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if service is running
echo "1. Checking if service is running..."
if lsof -i:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Service is running on port 3000"
    lsof -i:3000
else
    echo -e "${RED}✗${NC} No service found on port 3000"
    echo "   Start with: ./scripts/start-local.sh frontend"
    exit 1
fi
echo ""

# Test localhost
echo "2. Testing localhost:3000..."
if curl -s http://localhost:3000/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} localhost:3000 is accessible"
    curl -s http://localhost:3000/api/health | head -1
else
    echo -e "${RED}✗${NC} localhost:3000 is NOT accessible"
fi
echo ""

# Test 127.0.0.1
echo "3. Testing 127.0.0.1:3000..."
if curl -s http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} 127.0.0.1:3000 is accessible"
    curl -s http://127.0.0.1:3000/api/health | head -1
else
    echo -e "${RED}✗${NC} 127.0.0.1:3000 is NOT accessible"
fi
echo ""

# Get network IP
NETWORK_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "")
if [ -n "$NETWORK_IP" ]; then
    echo "4. Testing network IP ($NETWORK_IP:3000)..."
    if curl -s http://$NETWORK_IP:3000/api/health >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $NETWORK_IP:3000 is accessible"
        curl -s http://$NETWORK_IP:3000/api/health | head -1
        echo ""
        echo -e "${YELLOW}Try accessing: http://$NETWORK_IP:3000${NC}"
    else
        echo -e "${RED}✗${NC} $NETWORK_IP:3000 is NOT accessible"
    fi
    echo ""
fi

# Check firewall
echo "5. Checking firewall..."
if command -v ufw >/dev/null 2>&1; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1)
    echo "   UFW Status: $UFW_STATUS"
    if echo "$UFW_STATUS" | grep -q "active"; then
        echo -e "${YELLOW}   ⚠ Firewall is active. If you can't access, try:${NC}"
        echo "   sudo ufw allow 3000/tcp"
    fi
elif command -v firewall-cmd >/dev/null 2>&1; then
    echo "   firewalld detected"
    echo -e "${YELLOW}   ⚠ If you can't access, check firewalld rules${NC}"
else
    echo "   No common firewall detected"
fi
echo ""

# Check what's binding
echo "6. Port binding details..."
ss -tlnp 2>/dev/null | grep :3000 || netstat -tlnp 2>/dev/null | grep :3000
echo ""

# Summary
echo "=== Summary ==="
echo ""
echo "Service is running. Try these URLs in your browser:"
echo "  1. http://localhost:3000"
echo "  2. http://127.0.0.1:3000"
if [ -n "$NETWORK_IP" ]; then
    echo "  3. http://$NETWORK_IP:3000"
fi
echo ""
echo "If none work:"
echo "  - Try incognito/private browsing mode"
echo "  - Check browser console for errors (F12)"
echo "  - Try a different browser"
echo "  - Check if you have a proxy configured"
echo ""
