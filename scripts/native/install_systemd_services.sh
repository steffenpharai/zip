#!/bin/bash
#
# Install Systemd Services for Native ZIP Robot Services
#
# This script installs systemd service files for:
# - zip-vision.service (ROS 2 + YOLOE)
# - zip-robot-bridge.service (WebSocket/Serial bridge)
# - zip-serial-bridge.service (ROS 2 Arduino serial bridge)
# - zip-web.service (Next.js frontend)
# - zip-mcp.service (MCP server)
#
# Usage:
#   ./install_systemd_services.sh [username]
#
# The username defaults to the current user if not specified.
#

set -e

# Get username (default to current user)
USERNAME="${1:-$USER}"
USER_HOME=$(eval echo ~${USERNAME})

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Installing ZIP Robot Systemd Services${NC}"
echo "=========================================="
echo "User: ${USERNAME}"
echo "Home: ${USER_HOME}"
echo ""

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW}Note: This script needs sudo privileges to install systemd services${NC}"
    echo "You may be prompted for your password."
    echo ""
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVICES_DIR="${SCRIPT_DIR}/systemd"

# Check if services directory exists
if [[ ! -d "${SERVICES_DIR}" ]]; then
    echo -e "${RED}Error: Services directory not found: ${SERVICES_DIR}${NC}"
    exit 1
fi

# Function to install service
install_service() {
    local service_file="$1"
    local service_name=$(basename "${service_file}")
    
    if [[ ! -f "${service_file}" ]]; then
        echo -e "${RED}Error: Service file not found: ${service_file}${NC}"
        return 1
    fi
    
    echo -e "${GREEN}Installing ${service_name}...${NC}"
    
    # Replace %i with actual username in service file
    sudo sed "s|%i|${USERNAME}|g; s|%h|${USER_HOME}|g" "${service_file}" > "/tmp/${service_name}"
    
    # Copy to systemd directory
    sudo cp "/tmp/${service_name}" "/etc/systemd/system/${service_name}"
    
    # Set permissions
    sudo chmod 644 "/etc/systemd/system/${service_name}"
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    echo -e "${GREEN}✓ ${service_name} installed${NC}"
}

# Install all services
install_service "${SERVICES_DIR}/zip-vision.service"
install_service "${SERVICES_DIR}/zip-robot-bridge.service"
install_service "${SERVICES_DIR}/zip-serial-bridge.service"
install_service "${SERVICES_DIR}/zip-web.service"
install_service "${SERVICES_DIR}/zip-mcp.service"

# Enable services (but don't start yet)
echo ""
echo -e "${GREEN}Enabling services...${NC}"
sudo systemctl enable zip-vision.service
sudo systemctl enable zip-robot-bridge.service
sudo systemctl enable zip-serial-bridge.service
sudo systemctl enable zip-web.service
sudo systemctl enable zip-mcp.service

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Services installed:"
echo "  - zip-vision.service"
echo "  - zip-robot-bridge.service"
echo "  - zip-serial-bridge.service"
echo "  - zip-web.service"
echo "  - zip-mcp.service"
echo ""
echo "To start services:"
echo "  sudo systemctl start zip-vision.service"
echo "  sudo systemctl start zip-robot-bridge.service"
echo "  sudo systemctl start zip-serial-bridge.service"
echo "  sudo systemctl start zip-web.service"
echo "  sudo systemctl start zip-mcp.service"
echo ""
echo "To check status:"
echo "  sudo systemctl status zip-vision.service"
echo "  sudo systemctl status zip-robot-bridge.service"
echo "  sudo systemctl status zip-serial-bridge.service"
echo "  sudo systemctl status zip-web.service"
echo "  sudo systemctl status zip-mcp.service"
echo ""
echo "To view logs:"
echo "  journalctl -u zip-vision.service -f"
echo "  journalctl -u zip-robot-bridge.service -f"
echo "  journalctl -u zip-serial-bridge.service -f"
echo "  journalctl -u zip-web.service -f"
echo "  journalctl -u zip-mcp.service -f"
