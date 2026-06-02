# Old Bridge Removal - Complete

## Summary

The old Node.js WebSocket bridge (`zip-robot-bridge.service`) has been completely removed from the system.

## What Was Removed

### Systemd Service
- ✅ Stopped `zip-robot-bridge.service`
- ✅ Disabled service from auto-starting
- ✅ Removed `/etc/systemd/system/zip-robot-bridge.service`
- ✅ Reloaded systemd daemon

### Verification
- ✅ No processes running on ports 8765/8766
- ✅ Service no longer exists in systemd
- ✅ Ports 8765/8766 are now free

## What Remains (Active Services)

### Current Active Services
```
✅ zip-serial-bridge.service  - ROS 2 Serial Bridge (primary)
✅ zip-mcp.service            - MCP Server (port 8769)
✅ zip-vision.service          - Vision System
✅ zip-web.service             - Next.js Web App
```

## Architecture After Removal

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

## Code References

The old bridge code still exists in the repository at:
- `robot/bridge/zip-robot-bridge/` - Source code (kept for reference)
- `scripts/native/systemd/zip-robot-bridge.service` - Service template (kept for reference)

These are kept for historical reference but are no longer used in production.

## Tool Routing

All robot tools are now routed through MCP → ROS 2:

### Via MCP (All tools)
- `get_robot_status` - Uses ROS 2 service check via MCP
- `get_robot_sensors` - Uses ROS 2 topics via MCP
- `get_robot_diagnostics` - Uses ROS 2 service via MCP
- `robot_move` - Uses ROS 2 `/cmd_vel` topic via MCP
- `robot_stop` - Uses ROS 2 `/emergency_stop` service via MCP
- `robot_servo_control` - Uses ROS 2 `/servo_control` service via MCP
- `robot_macro_execute` - Uses ROS 2 `/macro_execute` service via MCP
- `robot_macro_cancel` - Uses ROS 2 `/macro_cancel` service via MCP
- `robot_direct_motor_control` - Uses ROS 2 `/direct_motor_control` service via MCP
- `robot_rerun_init` - Uses ROS 2 `/rerun_init` service via MCP
- `robot_set_drive_config` - Uses ROS 2 `/set_drive_config` service via MCP

## Legacy Code Notes

Some tool implementations still have fallback code that references the old bridge client (`checkBridgeHealth()`, etc.), but these are **not executed** because:

1. All robot tools are marked as MCP tools in `lib/tools/mcp-client.ts`
2. The tool executor routes MCP tools directly to the MCP client
3. The local implementations are never called for MCP tools

This legacy code can be cleaned up in a future refactoring, but it doesn't affect functionality.

## Status: ✅ REMOVAL COMPLETE

The old bridge service has been completely removed from the system. All robot communication now flows through the single ROS 2 serial bridge via MCP.
