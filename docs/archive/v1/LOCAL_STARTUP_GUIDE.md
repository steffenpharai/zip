# Local Development Startup Guide

This guide provides reliable instructions for starting ZIP services locally.

## Quick Start

The easiest way to start all services:

```bash
./scripts/start-local.sh all --fix-permissions
```

This will:
- ✅ Check Node.js version (requires 18+)
- ✅ Verify dependencies are installed
- ✅ Check for .env file
- ✅ Fix permission issues (if needed)
- ✅ Check for port conflicts
- ✅ Start both frontend and bridge services
- ✅ Verify services are running

## Common Issues & Solutions

### Permission Denied Error

If you see `EACCES: permission denied, mkdir '/home/steffen/Projects/Zip/.next/dev'`:

```bash
# Option 1: Use the startup script with fix-permissions flag
./scripts/start-local.sh all --fix-permissions

# Option 2: Manually fix permissions
sudo chown -R $USER:$USER .next
# Or remove and let it recreate
rm -rf .next
```

### Port Already in Use

If port 3000 or 8765/8766 are already in use:

```bash
# The startup script will detect this and ask to kill the process
# Or manually find and kill:
lsof -ti:3000 | xargs kill -9
lsof -ti:8765 | xargs kill -9
lsof -ti:8766 | xargs kill -9
```

### Missing Dependencies

The startup script will automatically install dependencies if `node_modules` is missing. To manually install:

```bash
npm install
cd robot/bridge/zip-robot-bridge && npm install && cd ../..
```

### Missing .env File

The startup script will copy from `example-env` if `.env` is missing. Make sure to add your `OPENAI_API_KEY`:

```bash
cp example-env .env
# Edit .env and add your OPENAI_API_KEY
```

## Service Commands

### Start All Services
```bash
./scripts/start-local.sh all
```

### Start Individual Services
```bash
# Frontend only
./scripts/start-local.sh frontend

# Bridge only
./scripts/start-local.sh bridge
```

### Check Status
```bash
./scripts/start-local.sh status
```

### Stop All Services
```bash
./scripts/start-local.sh stop
```

## Manual Startup (Alternative)

If you prefer to start services manually:

**Terminal 1 - Frontend:**
```bash
npm run dev:local
```

**Terminal 2 - Bridge:**
```bash
npm run dev:bridge
```

## Service URLs

Once started, services are available at:

- **Frontend**: http://localhost:3000
- **Frontend Health**: http://localhost:3000/api/health
- **Bridge WebSocket**: ws://localhost:8765/robot
- **Bridge HTTP**: http://localhost:8766/health

## Logs

Service logs are written to:

- **Frontend**: `/tmp/zip-frontend.log`
- **Bridge**: `/tmp/zip-bridge.log`

View logs:
```bash
tail -f /tmp/zip-frontend.log
tail -f /tmp/zip-bridge.log
```

## Troubleshooting

### Frontend won't start

1. Check Node.js version: `node -v` (needs 18+)
2. Check for permission issues: `ls -la .next`
3. Check port availability: `lsof -i:3000`
4. Check logs: `tail -f /tmp/zip-frontend.log`

### Bridge won't start

1. Check bridge dependencies: `cd robot/bridge/zip-robot-bridge && npm install`
2. Check port availability: `lsof -i:8765` and `lsof -i:8766`
3. Check logs: `tail -f /tmp/zip-bridge.log`

### Services start but don't respond

1. Wait a few seconds for services to fully initialize
2. Check service status: `./scripts/start-local.sh status`
3. Verify health endpoints:
   - `curl http://localhost:3000/api/health`
   - `curl http://localhost:8766/health`

## Next Steps

After services are running:

1. Open http://localhost:3000 in your browser
2. Connect your robot (if using hardware)
3. Start developing!

For more information, see the main [README.md](README.md).
