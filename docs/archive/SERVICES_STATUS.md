# Services Status Report

## ✅ All Services Running and Healthy

### Container Status
- **zip-app-dev**: ✅ Running (healthy) - Port 3000
- **vision-service-dev**: ✅ Running (healthy) - Port 8767

### Frontend Service
- **URL**: http://localhost:3000
- **Status**: ✅ Healthy
- **Vision Diagnostics Page**: http://localhost:3000/vision-diagnostics
- **API Health**: ✅ Responding

### Vision Service (YOLOE)
- **Diagnostics Bridge**: ✅ Active on port 8767
- **Camera**: ✅ Active
- **Detections**: ✅ Active (~9.6 FPS)
- **Model**: YOLOE (yoloe-11s-seg-pf.pt)

### API Endpoints

#### Diagnostics Bridge (Port 8767)
- ✅ `GET /api/vision/status` - System status
- ✅ `GET /api/vision/detections` - Latest detections (JSON)
- ✅ `GET /api/vision/camera` - Camera feed (JPEG)
- ✅ `GET /api/vision/visualization` - Visualization with overlays (JPEG)
- ✅ `GET /api/vision/config` - Model configuration

#### Frontend API (Port 3000)
- ✅ `GET /api/health` - Health check
- ✅ `GET /api/vision/diagnostics` - Diagnostics data
- ✅ `GET /api/vision/detections` - Detections (proxied from bridge)
- ✅ `GET /api/vision/camera` - Camera feed (proxied from bridge)

### Network Ports
- ✅ Port 3000: Listening (Frontend)
- ✅ Port 8767: Listening (Diagnostics Bridge)

## Access Points

### Frontend
- **Main App**: http://localhost:3000
- **YOLOE Diagnostics**: http://localhost:3000/vision-diagnostics

### Direct API Access
- **Bridge API**: http://localhost:8767/api/vision/detections
- **Bridge Status**: http://localhost:8767/api/vision/status

## Current Performance
- **FPS**: ~9.6 FPS
- **Detections per frame**: 400-700
- **Model confidence threshold**: 50%
- **System status**: All healthy

## Quick Test Commands

```bash
# Check container status
docker ps | grep -E "vision|zip-app"

# Test diagnostics bridge
curl http://localhost:8767/api/vision/status

# Test frontend API
curl http://localhost:3000/api/health

# View detections
curl http://localhost:8767/api/vision/detections | jq '.detections | length'
```

## Status: ✅ READY FOR USE

All services are running and accessible. You can now:
1. Open http://localhost:3000/vision-diagnostics in your browser
2. View live camera feed with YOLOE detections
3. Adjust confidence thresholds and visualization settings
4. Monitor performance metrics
