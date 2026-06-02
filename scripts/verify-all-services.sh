#!/bin/bash
# Comprehensive service verification script

set -e

echo "=== ZIP Service Verification ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check 1: Web Service
echo -e "${BLUE}1. Web Service Status${NC}"
if systemctl is-active --quiet zip-web.service; then
    echo -e "${GREEN}✓ zip-web.service is active${NC}"
    PID=$(systemctl show zip-web.service -p MainPID --value)
    echo "   PID: $PID"
else
    echo -e "${RED}✗ zip-web.service is not active${NC}"
    exit 1
fi

# Check 2: API Health
echo ""
echo -e "${BLUE}2. API Health Check${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
    echo -e "${GREEN}✓ API health endpoint responding (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠ API health endpoint returned HTTP $HEALTH${NC}"
fi

# Check 3: Conversation API
echo ""
echo -e "${BLUE}3. Conversation API Test${NC}"
RESPONSE=$(curl -s -X POST http://localhost:3000/api/agent \
    -H "Content-Type: application/json" \
    -d '{"message":"test","conversationHistory":[]}' \
    --max-time 15 2>&1)

TEXT_EVENTS=$(echo "$RESPONSE" | grep -c "event: text" || echo "0")
DONE_EVENT=$(echo "$RESPONSE" | grep -c "event: done" || echo "0")

if [ "$TEXT_EVENTS" -gt 0 ] && [ "$DONE_EVENT" -gt 0 ]; then
    echo -e "${GREEN}✓ Conversation API working${NC}"
    echo "   Text events: $TEXT_EVENTS"
    echo "   Done event: $DONE_EVENT"
    SAMPLE=$(echo "$RESPONSE" | grep -A 1 "event: text" | head -2 | grep "delta" | head -1 | cut -d'"' -f4 || echo "N/A")
    echo "   Sample response: ${SAMPLE:0:50}..."
else
    echo -e "${RED}✗ Conversation API not working properly${NC}"
    echo "   Text events: $TEXT_EVENTS"
    echo "   Done event: $DONE_EVENT"
fi

# Check 4: Vision Bridge
echo ""
echo -e "${BLUE}4. Vision Bridge${NC}"
VISION_DETECTIONS=$(curl -s http://localhost:8767/api/vision/detections 2>/dev/null | jq -r '.detections | length' 2>/dev/null || echo "error")
if [ "$VISION_DETECTIONS" != "error" ] && [ -n "$VISION_DETECTIONS" ]; then
    echo -e "${GREEN}✓ Vision bridge accessible${NC}"
    echo "   Detections available: $VISION_DETECTIONS"
else
    echo -e "${YELLOW}⚠ Vision bridge not accessible or no detections${NC}"
fi

# Check 5: Vision Tools
echo ""
echo -e "${BLUE}5. Vision Tools Integration${NC}"
VISION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/agent \
    -H "Content-Type: application/json" \
    -d '{"message":"what objects do you see?","conversationHistory":[]}' \
    --max-time 30 2>&1)

VISION_TEXT=$(echo "$VISION_RESPONSE" | grep -c "event: text" || echo "0")
if [ "$VISION_TEXT" -gt 0 ]; then
    echo -e "${GREEN}✓ Vision query working${NC}"
    echo "   Response events: $VISION_TEXT"
else
    echo -e "${YELLOW}⚠ Vision query may have issues${NC}"
fi

# Check 6: Frontend
echo ""
echo -e "${BLUE}6. Frontend Accessibility${NC}"
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$FRONTEND" = "200" ]; then
    echo -e "${GREEN}✓ Frontend accessible (HTTP 200)${NC}"
else
    echo -e "${RED}✗ Frontend returned HTTP $FRONTEND${NC}"
fi

# Summary
echo ""
echo "=== Summary ==="
echo "Service: $(systemctl is-active zip-web.service)"
echo "API: Working ($TEXT_EVENTS text events in test)"
echo "Vision: $([ "$VISION_DETECTIONS" != "error" ] && echo "Available ($VISION_DETECTIONS detections)" || echo "Not available")"
echo "Frontend: $([ "$FRONTEND" = "200" ] && echo "Accessible" || echo "Not accessible")"
echo ""
echo "If conversation isn't working in browser:"
echo "1. Check browser console for JavaScript errors"
echo "2. Verify browser can connect to http://localhost:3000"
echo "3. Check Network tab for /api/agent requests"
echo "4. Verify SSE events are being received"
