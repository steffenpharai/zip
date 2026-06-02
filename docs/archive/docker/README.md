# Docker Deployment Guide

Comprehensive guide for deploying ZIP application and robot bridge services using Docker.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Quick Start

### Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- `.env` file with required environment variables

### Development

```bash
# Start all services
make dev
# or
docker-compose up

# Start only ZIP app
make dev:app
# or
docker-compose up zip-app

# Start only robot bridge
make dev:robot
# or
docker-compose up robot-bridge
```

### Production

```bash
# Build production images
make prod:build
# or
docker-compose -f docker-compose.prod.yml build

# Start production services
make prod:up
# or
docker-compose -f docker-compose.prod.yml up -d
```

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────┐
│   ZIP App       │  HTTP   │  Robot Bridge    │ Serial  │   Robot     │
│  (Next.js)      │◄───────►│  (Node.js)       │◄───────►│  (Arduino)  │
│  Port: 3000     │  WS     │  WS: 8765        │         │  USB Serial │
│                 │         │  HTTP: 8766       │         │             │
└─────────────────┘         └──────────────────┘         └─────────────┘
```

### Services

1. **zip-app**: Next.js application
   - Port: 3000 (HTTP)
   - Health: `GET /api/health`
   - Connects to robot bridge via WebSocket

2. **robot-bridge**: Robot communication bridge
   - Port: 8765 (WebSocket)
   - Port: 8766 (HTTP)
   - Health: `GET /health`
   - Connects to robot via serial port

### Network

- **Network**: `zip-network` (bridge network)
- **Service Discovery**: Services can reach each other by name
  - ZIP app → `robot-bridge:8765`
  - Robot bridge → `robot-bridge:8765` (self)

### Volumes

- **zip-app-node-modules**: Persistent node_modules cache
- **zip-app-next-cache**: Next.js build cache
- **robot-bridge-node-modules**: Robot bridge node_modules cache
- **robot-bridge-dist**: Robot bridge build output cache

## Development Setup

### Initial Setup

1. **Create `.env` file**:
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

2. **Start services**:
   ```bash
   make dev
   ```

3. **Access services**:
   - ZIP App: http://localhost:3000
   - Robot Bridge Health: http://localhost:8766/health

### Hot Reloading

Both services support hot reloading in development:

- **ZIP App**: Next.js Turbo mode with file watching
- **Robot Bridge**: tsx watch mode with TypeScript compilation

Source code is mounted as volumes, so changes are immediately reflected.

### Serial Port Configuration

For robot bridge to access serial ports, configure device mapping in `docker-compose.yml`:

**Linux**:
```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
```

**Windows/WSL2**:
```yaml
devices:
  - //./COM3:/dev/ttyUSB0
```

**Alternative (less secure)**:
```yaml
privileged: true
```

### Development Commands

```bash
# View logs
make dev:logs
make dev:logs SERVICE=zip-app
make dev:logs SERVICE=robot-bridge

# Open shell in container
make dev:shell
make dev:shell SERVICE=robot-bridge

# Rebuild containers
make dev:build

# Clean up (removes containers and volumes)
make dev:clean

# Check health
make health
```

## Production Deployment

### Building Images

```bash
# Build all images
make prod:build

# Build specific service
docker-compose -f docker-compose.prod.yml build zip-app
docker-compose -f docker-compose.prod.yml build robot-bridge
```

### Running Services

```bash
# Start in detached mode
make prod:up

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
make prod:down
```

### Production Features

- Multi-stage builds for optimized image sizes
- Non-root users for security
- Health checks with longer intervals
- Resource limits
- Read-only filesystems (where possible)
- Structured JSON logging
- Log rotation and compression

### Resource Limits

Default limits (configurable in docker-compose.prod.yml):

- **ZIP App**: 2GB memory, 2 CPU cores
- **Robot Bridge**: 512MB memory, 1 CPU core

## Configuration

### Environment Variables

See `.env.example` for all available environment variables.

**Required**:
- `OPENAI_API_KEY`: OpenAI API key

**ZIP App**:
- `NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL`: Robot bridge WebSocket URL (auto-set in Docker)
- All OpenAI model configurations

**Robot Bridge**:
- `SERIAL_PORT`: Serial port path (optional, auto-detected)
- `SERIAL_BAUD`: Baud rate (default: 115200)
- `LOOPBACK_MODE`: Enable loopback mode for testing (default: false)

### Serial Port Access

The robot bridge needs access to serial ports. Configure in `docker-compose.yml`:

1. **Device Mapping** (recommended):
   ```yaml
   devices:
     - /dev/ttyUSB0:/dev/ttyUSB0
   ```

2. **Privileged Mode** (less secure):
   ```yaml
   privileged: true
   ```

3. **User Permissions** (Linux):
   ```bash
   sudo usermod -aG dialout $USER
   # Log out and back in
   ```

### Network Configuration

Services communicate via the `zip-network` bridge network:

- ZIP app connects to robot bridge at `ws://robot-bridge:8765/robot`
- Robot bridge is accessible at `robot-bridge:8765` from ZIP app
- Both services are isolated from host network (except exposed ports)

## Troubleshooting

### Common Issues

#### Port Already in Use

**Error**: `Bind for 0.0.0.0:3000 failed: port is already allocated`

**Solution**:
```bash
# Find process using port
# Linux/Mac:
lsof -i :3000
# Windows:
netstat -ano | findstr :3000

# Kill process or change port in docker-compose.yml
```

#### Serial Port Not Found

**Error**: `Cannot open serial port`

**Solutions**:
1. Check device exists: `ls -l /dev/ttyUSB*` (Linux)
2. Verify permissions: `sudo chmod 666 /dev/ttyUSB0`
3. Add user to dialout group: `sudo usermod -aG dialout $USER`
4. Use privileged mode in docker-compose.yml (less secure)

#### Health Checks Failing

**Error**: Container shows as unhealthy

**Solutions**:
1. Check logs: `docker-compose logs zip-app`
2. Verify health endpoint: `curl http://localhost:3000/api/health`
3. Increase health check start period in docker-compose.yml
4. Check resource limits (may be out of memory)

#### Hot Reloading Not Working

**Solutions**:
1. Verify `WATCHPACK_POLLING=true` is set
2. Check volume mounts in docker-compose.yml
3. Restart containers: `docker-compose restart`
4. Rebuild: `make dev:build`

#### Cannot Connect to Robot Bridge

**Error**: ZIP app cannot connect to robot bridge

**Solutions**:
1. Verify robot bridge is running: `docker-compose ps`
2. Check network: `docker network inspect zip-network`
3. Verify environment variable: `NEXT_PUBLIC_ROBOT_BRIDGE_WS_URL=ws://robot-bridge:8765/robot`
4. Check robot bridge logs: `docker-compose logs robot-bridge`

### Debugging

#### View Container Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f zip-app
docker-compose logs -f robot-bridge

# Last 100 lines
docker-compose logs --tail=100 zip-app
```

#### Execute Commands in Container

```bash
# Open shell
docker-compose exec zip-app sh
docker-compose exec robot-bridge sh

# Run specific command
docker-compose exec zip-app npm run typecheck
docker-compose exec robot-bridge node -e "console.log(process.env)"
```

#### Inspect Containers

```bash
# Container status
docker-compose ps

# Container details
docker inspect zip-app-dev

# Network details
docker network inspect zip-network

# Volume details
docker volume ls
docker volume inspect zip-app-node-modules
```

#### Health Check Debugging

```bash
# Manual health check
curl http://localhost:3000/api/health | jq .
curl http://localhost:8766/health | jq .

# Container health status
docker inspect --format='{{json .State.Health}}' zip-app-dev | jq .
```

## Best Practices

### Security

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Use non-root users** - Production images run as non-root
3. **Limit resource usage** - Set CPU and memory limits
4. **Use secrets for sensitive data** - Consider Docker secrets for production
5. **Keep images updated** - Regularly update base images

### Performance

1. **Use named volumes** - Faster than bind mounts for node_modules
2. **Enable build cache** - Docker layer caching speeds up rebuilds
3. **Optimize Dockerfile layers** - Copy package.json before source code
4. **Use multi-stage builds** - Smaller production images

### Development

1. **Use Makefile commands** - Consistent workflow across team
2. **Check health regularly** - Use `make health` to verify services
3. **Clean up regularly** - Use `make dev:clean` to free space
4. **Monitor logs** - Keep logs visible during development

### Production

1. **Use production compose file** - `docker-compose.prod.yml`
2. **Set resource limits** - Prevent resource exhaustion
3. **Enable log rotation** - Prevent disk space issues
4. **Monitor health checks** - Set up alerts for unhealthy containers
5. **Use reverse proxy** - Consider nginx/traefik for production

### Serial Port Access

1. **Use device mapping** - More secure than privileged mode
2. **Set proper permissions** - Add user to dialout group (Linux)
3. **Test with loopback mode** - Use `LOOPBACK_MODE=true` for testing
4. **Document port paths** - Keep track of which port is which device

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Next.js Docker Deployment](https://nextjs.org/docs/deployment#docker-image)
- [Node SerialPort Documentation](https://serialport.io/docs/)

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review container logs: `docker-compose logs`
3. Check service health: `make health`
4. Open an issue on GitHub

