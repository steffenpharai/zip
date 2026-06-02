#!/usr/bin/env python3
"""
MCP HTTP Server Wrapper

Wraps the MCP server to expose it via HTTP/SSE transport for Next.js integration.
Uses FastMCP's HTTP transport capabilities.
"""

import asyncio
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import rclpy
from typing import Dict, Any, Optional

from zip_orchestration.mcp_server import mcp, get_ros_node, ZIPMCPNode
import rclpy

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="ZIP Robot MCP Server", version="1.0.0")

# CORS middleware for Next.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/mcp/health")
async def health_check():
    """Health check endpoint"""
    try:
        node = get_ros_node()
        return {"status": "healthy", "ros2_ok": rclpy.ok()}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


@app.post("/mcp/tools/list")
async def list_tools():
    """List available MCP tools"""
    try:
        # Get tools from MCP server
        # FastMCP stores tools in a registry
        tools = []
        
        # Access tools via FastMCP's internal registry
        if hasattr(mcp, '_tools'):
            for tool_name, tool_func in mcp._tools.items():
                tools.append({
                    "name": tool_name,
                    "description": tool_func.__doc__ or f"Tool: {tool_name}",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},  # FastMCP handles schema automatically
                    }
                })
        else:
            # Fallback: manually list known tools
            known_tools = [
                "robot_move", "robot_stop", "get_robot_sensors",
                "get_robot_diagnostics", "get_robot_status", "get_vision_detections"
            ]
            for tool_name in known_tools:
                tools.append({
                    "name": tool_name,
                    "description": f"MCP tool: {tool_name}",
                    "inputSchema": {"type": "object", "properties": {}}
                })
        
        return {"tools": tools}
    except Exception as e:
        logger.error(f"Error listing tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/mcp/tools/call")
async def call_tool(request: Dict[str, Any]):
    """Call an MCP tool"""
    tool_name = None
    try:
        tool_name = request.get("name")
        arguments = request.get("arguments", {})
        
        if not tool_name:
            raise HTTPException(status_code=400, detail="Tool name required")
        
        # Import tool functions directly from mcp_server
        from zip_orchestration.mcp_server import (
            robot_move, robot_stop, get_robot_sensors,
            get_robot_diagnostics, get_robot_status, get_vision_detections
        )
        
        # Map tool names to functions
        tool_map = {
            "robot_move": robot_move,
            "robot_stop": robot_stop,
            "get_robot_sensors": get_robot_sensors,
            "get_robot_diagnostics": get_robot_diagnostics,
            "get_robot_status": get_robot_status,
            "get_vision_detections": get_vision_detections,
        }
        
        if tool_name not in tool_map:
            raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
        
        tool_func = tool_map[tool_name]
        
        # Call tool with arguments
        # Handle different argument patterns
        if tool_name == "robot_move":
            result_text = tool_func(
                linear_x=arguments.get("linear_x", 0.0),
                angular_z=arguments.get("angular_z", 0.0)
            )
        elif tool_name == "robot_stop":
            result_text = tool_func()
        elif tool_name in ["get_robot_sensors", "get_robot_diagnostics", "get_robot_status", "get_vision_detections"]:
            result_text = tool_func()
        else:
            # Generic call
            result_text = tool_func(**arguments)
        
        # Return in MCP format
        return {
            "content": [
                {
                    "type": "text",
                    "text": result_text
                }
            ],
            "isError": False
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calling tool {tool_name}: {e}", exc_info=True)
        return {
            "content": [
                {
                    "type": "text",
                    "text": f'{{"success": false, "error": "{str(e)}"}}'
                }
            ],
            "isError": True
        }


def run_http_server(host: str = "0.0.0.0", port: int = 8769):
    """Run HTTP server for MCP"""
    # Get ROS node (will initialize ROS 2 if needed)
    get_ros_node()
    
    logger.info(f"Starting MCP HTTP server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8769
    run_http_server(port=port)
