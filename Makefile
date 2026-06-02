.PHONY: help start stop restart status logs health install-services robot-serial

# Default target
help:
	@echo "ZIP Native Service Management Commands"
	@echo ""
	@echo "Service Management:"
	@echo "  make start                    - Start all services (vision, robot-bridge, web)"
	@echo "  make stop                     - Stop all services"
	@echo "  make restart                  - Restart all services"
	@echo "  make status                  - Show status of all services"
	@echo "  make logs                     - View logs (all services)"
	@echo "  make logs SERVICE=zip-vision - View logs for specific service"
	@echo "  make logs SERVICE=zip-mcp   - View logs for MCP server"
	@echo ""
	@echo "Installation:"
	@echo "  make install:services         - Install systemd service files"
	@echo ""
	@echo "Utilities:"
	@echo "  make health                  - Check health of all services"
	@echo "  make robot-serial            - List available serial ports"

# Service names
SERVICES = zip-vision zip-robot-bridge zip-web zip-mcp

# Start all services
start:
	@echo "Starting ZIP services..."
	@for service in $(SERVICES); do \
		echo "Starting $$service..."; \
		sudo systemctl start $$service.service || true; \
	done
	@echo "✓ All services started"
	@make status

# Stop all services
stop:
	@echo "Stopping ZIP services..."
	@for service in $(SERVICES); do \
		echo "Stopping $$service..."; \
		sudo systemctl stop $$service.service || true; \
	done
	@echo "✓ All services stopped"

# Restart all services
restart:
	@echo "Restarting ZIP services..."
	@for service in $(SERVICES); do \
		echo "Restarting $$service..."; \
		sudo systemctl restart $$service.service || true; \
	done
	@echo "✓ All services restarted"
	@make status

# Show status of all services
status:
	@echo "Service Status:"
	@echo "=============="
	@for service in $(SERVICES); do \
		echo ""; \
		echo "$$service:"; \
		sudo systemctl status $$service.service --no-pager -l || true; \
	done

# View logs
logs:
	@if [ -z "$(SERVICE)" ]; then \
		echo "Viewing logs for all services (Ctrl+C to exit)..."; \
		sudo journalctl -u zip-vision.service -u zip-robot-bridge.service -u zip-web.service -f; \
	else \
		echo "Viewing logs for $(SERVICE) (Ctrl+C to exit)..."; \
		sudo journalctl -u $(SERVICE).service -f; \
	fi

# Install systemd services
install-services:
	@echo "Installing systemd services..."
	@bash scripts/native/install_systemd_services.sh $(USER)
	@echo "✓ Services installed"
	@echo "Run 'make start' to start services"

# Health checks
health:
	@echo "Checking ZIP web app health..."
	@curl -s http://localhost:3000/api/health | jq . || echo "✗ ZIP web app not responding"
	@echo ""
	@echo "Checking robot bridge health..."
	@curl -s http://localhost:8766/health | jq . || echo "✗ Robot bridge not responding"
	@echo ""
	@echo "Checking vision service health..."
	@curl -s http://localhost:8767/api/vision/status | jq . || echo "✗ Vision service not responding"
	@echo ""
	@echo "Checking MCP server health..."
	@curl -s http://localhost:8769/mcp/health | jq . || echo "✗ MCP server not responding"

# Serial port listing
robot-serial:
	@echo "Available serial ports:"
	@node -e "require('serialport').SerialPort.list().then(ports => console.log(JSON.stringify(ports, null, 2))).catch(err => console.error('Error:', err.message))" || echo "Install serialport: npm install serialport"
