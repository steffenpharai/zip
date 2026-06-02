/**
 * Robot WebSocket Client
 * Handles WebSocket connection, command sending, and event handling
 */

class RobotClient {
  constructor() {
    this.ws = null;
    this.url = `ws://${window.location.hostname}:8765/robot`;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2000;
    this.reconnectTimer = null;
    this.nextSeq = 1;
    this.pendingCommands = new Map();
    this.telemetryCallbacks = [];
    this.infoCallbacks = [];
    this.faultCallbacks = [];
    this.connectionStateCallbacks = [];
    this.latestTelemetry = null;
    this.latestInfo = null;
    this.serialConnectionInfo = null;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.updateConnectionState('connecting');
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[RobotClient] Connected to bridge');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.updateConnectionState('connected');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[RobotClient] Failed to parse message:', error);
          this.handleError(new Error('Failed to parse message from server'));
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[RobotClient] WebSocket error:', error);
        this.updateConnectionState('error');
      };
      
      this.ws.onclose = () => {
        console.log('[RobotClient] WebSocket closed');
        this.connected = false;
        this.updateConnectionState('disconnected');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[RobotClient] Connection error:', error);
      this.updateConnectionState('error');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.updateConnectionState('disconnected');
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[RobotClient] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, this.reconnectDelay);
  }

  handleMessage(message) {
    try {
      switch (message.type) {
        case 'info':
          this.latestInfo = message.data;
          this.infoCallbacks.forEach(cb => {
            try {
              cb(message.data);
            } catch (error) {
              console.error('[RobotClient] Error in info callback:', error);
            }
          });
          break;
          
        case 'telemetry':
          this.latestTelemetry = message.data;
          this.telemetryCallbacks.forEach(cb => {
            try {
              cb(message.data);
            } catch (error) {
              console.error('[RobotClient] Error in telemetry callback:', error);
            }
          });
          break;
          
        case 'ack':
          this.handleACK(message);
          break;
          
        case 'fault':
          this.faultCallbacks.forEach(cb => {
            try {
              cb(message.data);
            } catch (error) {
              console.error('[RobotClient] Error in fault callback:', error);
            }
          });
          break;
          
        case 'connection_state':
          // Update connection state based on serial connection
          if (message.data && message.data.connected !== undefined) {
            this.updateConnectionState(message.data.connected ? 'connected' : 'disconnected');
            // Store serial connection info for diagnostics
            this.serialConnectionInfo = message.data;
          }
          break;
          
        default:
          console.warn('[RobotClient] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[RobotClient] Error handling message:', error);
      this.handleError(error);
    }
  }
  
  handleError(error) {
    console.error('[RobotClient] Error:', error);
    // Notify error callbacks if we add them
    // For now, just log
  }

  handleACK(message) {
    const { seq, ok, message: msg } = message;
    const pending = this.pendingCommands.get(seq);
    
    if (pending) {
      // Clear timeout
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      
      this.pendingCommands.delete(seq);
      
      if (ok) {
        pending.resolve({ ok: true, message: msg });
      } else {
        const errorMsg = msg || `Command failed: ${pending.cmd || 'unknown'}`;
        pending.reject(new Error(errorMsg));
      }
    } else {
      console.warn(`[RobotClient] Received ACK for unknown sequence: ${seq}`);
    }
  }

  sendCommand(cmd, payload = {}) {
    return new Promise((resolve, reject) => {
      // Validate command
      if (!cmd || typeof cmd !== 'string') {
        reject(new Error('Invalid command: command must be a non-empty string'));
        return;
      }
      
      // Validate payload
      if (payload && typeof payload !== 'object') {
        reject(new Error('Invalid payload: payload must be an object'));
        return;
      }
      
      // Check connection
      if (!this.ws) {
        reject(new Error('WebSocket not initialized. Attempting to connect...'));
        this.connect();
        return;
      }
      
      if (this.ws.readyState !== WebSocket.OPEN) {
        const state = this.getConnectionState();
        reject(new Error(`Not connected to robot (state: ${state}). Please wait for connection.`));
        return;
      }
      
      const seq = this.getNextSeq();
      const message = {
        type: 'command',
        cmd,
        payload: payload || {},
        seq,
      };
      
      // Store pending command
      const commandData = { resolve, reject, timestamp: Date.now(), cmd };
      this.pendingCommands.set(seq, commandData);
      
      // Set timeout (5 seconds)
      const timeoutId = setTimeout(() => {
        if (this.pendingCommands.has(seq)) {
          this.pendingCommands.delete(seq);
          reject(new Error(`Command timeout: ${cmd} (seq: ${seq})`));
        }
      }, 5000);
      
      // Store timeout ID for cleanup
      commandData.timeoutId = timeoutId;
      
      try {
        const messageStr = JSON.stringify(message);
        this.ws.send(messageStr);
        console.log(`[RobotClient] Sent command: ${cmd}, seq: ${seq}`);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingCommands.delete(seq);
        reject(new Error(`Failed to send command: ${error.message}`));
      }
    });
  }

  getNextSeq() {
    const seq = this.nextSeq;
    this.nextSeq++;
    if (this.nextSeq > 255) {
      this.nextSeq = 1;
    }
    return seq;
  }

  onTelemetry(callback) {
    this.telemetryCallbacks.push(callback);
    // Immediately call with latest telemetry if available
    if (this.latestTelemetry) {
      callback(this.latestTelemetry);
    }
  }

  onInfo(callback) {
    this.infoCallbacks.push(callback);
    // Immediately call with latest info if available
    if (this.latestInfo) {
      callback(this.latestInfo);
    }
  }

  onFault(callback) {
    this.faultCallbacks.push(callback);
  }

  onConnectionState(callback) {
    this.connectionStateCallbacks.push(callback);
  }

  updateConnectionState(state) {
    this.connectionStateCallbacks.forEach(cb => cb(state));
  }

  getConnectionState() {
    if (!this.ws) return 'disconnected';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'disconnecting';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  getLatestTelemetry() {
    return this.latestTelemetry;
  }

  getLatestInfo() {
    return this.latestInfo;
  }
  
  getSerialConnectionInfo() {
    return this.serialConnectionInfo || null;
  }
}

// Global instance
const robotClient = new RobotClient();

// Auto-connect on load
window.addEventListener('load', () => {
  robotClient.connect();
});

// Export for use in other scripts
window.robotClient = robotClient;

