# Bridge Consolidation - Single Bridge Architecture

## Summary

Consolidated to a single bridge architecture using ROS 2 serial bridge only.

## Changes Made

### Disabled Old Bridge
- ✅ Stopped `zip-robot-bridge.service` (old Node.js bridge on port 8766)
- ✅ Disabled service from auto-starting
- ✅ Service status: `inactive (dead)`

### Active Bridge
- ✅ `zip-serial-bridge.service` - ROS 2 serial bridge (port N/A, uses ROS 2 services)
  - Connected to `/dev/ttyUSB0`
  - Handshake successful
  - All 8 ROS 2 services available

## Architecture

```
Chat Interface (Next.js)
  ↓
Agentic Pipeline (LangGraph)
  ↓
Tool Executor
  ↓
MCP Client (HTTP) → MCP Server (port 8769)
  ↓
ROS 2 Services (via serial_bridge_node)
  ↓
Arduino Firmware (/dev/ttyUSB0)
```

## Services Status

### Active Services
- ✅ `zip-serial-bridge.service` - ROS 2 serial bridge (primary)
- ✅ `zip-mcp.service` - MCP server (port 8769)
- ✅ `zip-vision.service` - Vision system
- ✅ `zip-web.service` - Next.js web app

### Disabled Services
- ❌ `zip-robot-bridge.service` - Old Node.js bridge (disabled)

## Tool Routing

All robot tools are now routed through MCP → ROS 2:

### Via MCP (ROS 2)
- `get_robot_status` - Uses ROS 2 service check
- `get_robot_sensors` - Uses ROS 2 topics
- `get_robot_diagnostics` - Uses ROS 2 service
- `robot_move` - Uses ROS 2 `/cmd_vel` topic
- `robot_stop` - Uses ROS 2 `/emergency_stop` service
- `robot_servo_control` - Uses ROS 2 `/servo_control` service
- `robot_macro_execute` - Uses ROS 2 `/macro_execute` service
- `robot_macro_cancel` - Uses ROS 2 `/macro_cancel` service
- `robot_direct_motor_control` - Uses ROS 2 `/direct_motor_control` service
- `robot_rerun_init` - Uses ROS 2 `/rerun_init` service
- `robot_set_drive_config` - Uses ROS 2 `/set_drive_config` service

## Benefits

1. **Single Source of Truth**: One bridge, one connection
2. **Consistency**: All tools use the same ROS 2 interface
3. **Reliability**: ROS 2 serial bridge is working and connected
4. **Simplicity**: No confusion about which bridge to use

## Verification

```bash
# Check ROS 2 services
ros2 service list | grep -E "(servo|macro|direct|rerun|set_drive|get_diagnostics|emergency)"
# Should show 8 services

# Check MCP server
curl http://localhost:8769/mcp/health
# Should return: {"status":"healthy","ros2_ok":true}

# Check serial bridge
sudo systemctl status zip-serial-bridge.service
# Should show: Active: active (running)
```

## Status: ✅ CONSOLIDATED

Single bridge architecture is now active. All robot control goes through ROS 2 serial bridge.
