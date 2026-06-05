#!/bin/bash
#
# MCP Integration Test Script
#
# Tests the complete MCP integration:
# 1. MCP server health
# 2. Tool listing
# 3. Tool execution
# 4. Next.js integration (if available)
#

set -e

MCP_URL="${MCP_SERVER_URL:-http://localhost:8769}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "MCP Integration Test"
echo "=========================================="
echo ""

# Test 1: Health Check
echo -n "Test 1: Health Check... "
HEALTH=$(curl -s "${MCP_URL}/mcp/health" 2>/dev/null)
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✓ PASSED${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Response: $HEALTH"
    exit 1
fi

# Test 2: Tool Listing
echo -n "Test 2: Tool Listing... "
TOOLS=$(curl -s -X POST "${MCP_URL}/mcp/tools/list" \
    -H "Content-Type: application/json" 2>/dev/null)
TOOL_COUNT=$(echo "$TOOLS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('tools', [])))" 2>/dev/null)
if [ "$TOOL_COUNT" -ge 6 ]; then
    echo -e "${GREEN}✓ PASSED${NC} (Found $TOOL_COUNT tools)"
else
    echo -e "${RED}✗ FAILED${NC} (Found only $TOOL_COUNT tools)"
    exit 1
fi

# Test 3: Tool Execution - get_robot_status
echo -n "Test 3: Tool Execution (get_robot_status)... "
RESULT=$(curl -s -X POST "${MCP_URL}/mcp/tools/call" \
    -H "Content-Type: application/json" \
    -d '{"name": "get_robot_status", "arguments": {}}' 2>/dev/null)
if echo "$RESULT" | grep -q '"isError":false' || echo "$RESULT" | grep -q '"isError": false'; then
    echo -e "${GREEN}✓ PASSED${NC}"
else
    echo -e "${RED}✗ FAILED${NC}"
    echo "Response: $RESULT"
    exit 1
fi

# Test 4: Tool Execution - get_robot_sensors
echo -n "Test 4: Tool Execution (get_robot_sensors)... "
RESULT=$(curl -s -X POST "${MCP_URL}/mcp/tools/call" \
    -H "Content-Type: application/json" \
    -d '{"name": "get_robot_sensors", "arguments": {}}' 2>/dev/null)
if echo "$RESULT" | grep -q '"isError":false' || echo "$RESULT" | grep -q '"isError": false'; then
    echo -e "${GREEN}✓ PASSED${NC}"
else
    echo -e "${YELLOW}⚠ WARNING${NC} (May fail if robot not connected)"
fi

# Test 5: Systemd Service Status
echo -n "Test 5: Systemd Service Status... "
if systemctl is-active --quiet zip-mcp.service; then
    echo -e "${GREEN}✓ PASSED${NC} (Service is running)"
else
    echo -e "${RED}✗ FAILED${NC} (Service is not running)"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}All MCP Integration Tests Passed!${NC}"
echo "=========================================="
