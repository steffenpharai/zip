/**
 * MCP Client for ROS 2 Tool Execution
 * 
 * Connects to ROS 2 MCP server via HTTP/SSE transport.
 * Implements Model Context Protocol (MCP) client following industry standards.
 */

import { z } from "zod";

// MCP Protocol Types
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

interface MCPToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Client Configuration
 */
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:8769";
const MCP_TIMEOUT_MS = 10000; // 10 seconds

/**
 * MCP Client Class
 */
class MCPClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = MCP_SERVER_URL, timeout: number = MCP_TIMEOUT_MS) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * List available tools from MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/tools/list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        throw new Error(`MCP server error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tools || [];
    } catch (error) {
      console.error("[MCP] Error listing tools:", error);
      throw error;
    }
  }

  /**
   * Call a tool via MCP
   */
  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<unknown> {
    try {
      const toolCall: MCPToolCall = {
        name: toolName,
        arguments: arguments_,
      };

      const response = await fetch(`${this.baseUrl}/mcp/tools/call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toolCall),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP tool call failed: ${response.statusText} - ${errorText}`);
      }

      const result: MCPToolResult = await response.json();

      // Extract text content from MCP result
      if (result.content && result.content.length > 0) {
        const textContent = result.content[0]?.text;
        if (textContent) {
          try {
            // Try to parse as JSON (MCP tools return JSON strings)
            return JSON.parse(textContent);
          } catch {
            // If not JSON, return as string
            return textContent;
          }
        }
      }

      throw new Error("Empty result from MCP tool");
    } catch (error) {
      console.error(`[MCP] Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Check if MCP server is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let mcpClientInstance: MCPClient | null = null;

/**
 * Get MCP client instance
 */
export function getMCPClient(): MCPClient {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient();
  }
  return mcpClientInstance;
}

/**
 * Check if a tool should be executed via MCP
 */
export function isMCPTool(toolName: string): boolean {
  const mcpTools = [
    "robot_move",
    "robot_stop",
    "get_robot_sensors",
    "get_robot_diagnostics",
    "get_robot_status",
    "get_vision_detections",
    // Advanced control tools (via ROS 2 services)
    "robot_servo_control",
    "robot_macro_execute",
    "robot_macro_cancel",
    "robot_direct_motor_control",
    "robot_rerun_init",
    "robot_set_drive_config",
  ];
  return mcpTools.includes(toolName);
}

/**
 * Execute tool via MCP
 */
export async function executeMCPTool(
  toolName: string,
  input: unknown
): Promise<unknown> {
  const client = getMCPClient();
  
  // Convert input to record format expected by MCP
  const arguments_ = input as Record<string, unknown>;
  
  const result = await client.callTool(toolName, arguments_);
  return result;
}
