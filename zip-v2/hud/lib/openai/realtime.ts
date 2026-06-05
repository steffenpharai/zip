/**
 * Realtime WebSocket client for OpenAI Realtime API
 * 
 * Handles WebSocket connection, audio streaming, and tool calls
 */

export interface RealtimeClient {
  connect(sessionId: string): Promise<void>;
  disconnect(): void;
  sendAudio(audioData: ArrayBuffer): void;
  onAudio(callback: (audio: ArrayBuffer) => void): void;
  onMessage(callback: (message: string) => void): void;
  onToolCall(callback: (tool: string, args: unknown) => void): void;
  onStateChange(callback: (state: "connecting" | "connected" | "disconnected" | "error") => void): void;
}

export class RealtimeClientImpl implements RealtimeClient {
  private ws: WebSocket | null = null;
  private audioCallbacks: Array<(audio: ArrayBuffer) => void> = [];
  private messageCallbacks: Array<(message: string) => void> = [];
  private toolCallCallbacks: Array<(tool: string, args: unknown) => void> = [];
  private stateCallbacks: Array<(state: "connecting" | "connected" | "disconnected" | "error") => void> = [];
  private sessionId: string | null = null;

  async connect(sessionId: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    this.sessionId = sessionId;
    this.notifyStateChange("connecting");

    try {
      // Get session info from server
      const response = await fetch("/api/realtime/token");
      if (!response.ok) {
        throw new Error("Failed to get Realtime session");
      }

      const { model } = await response.json();
      
      // Note: In a real implementation, the API key should be handled server-side
      // For client-side WebSocket, we'd need to proxy through our server or use a different approach
      // This is a simplified version that assumes server-side proxying or secure key handling
      
      // For now, we'll use a fallback approach: connect via our server proxy
      // In production, you might want to use a server-side WebSocket proxy
      const wsUrl = `/api/realtime/ws?session=${sessionId}&model=${encodeURIComponent(model)}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.notifyStateChange("connected");
        
        // Send session configuration
        this.ws?.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: "You are J.A.R.V.I.S, a helpful AI assistant. Be concise and confident.",
            voice: "alloy",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
          },
        }));
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.notifyStateChange("error");
      };

      this.ws.onclose = () => {
        this.notifyStateChange("disconnected");
        this.ws = null;
      };
    } catch (error) {
      this.notifyStateChange("error");
      throw error;
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "object" || data === null) return;

    const msg = data as Record<string, unknown>;

    // Handle different message types
    if (msg.type === "response.audio_transcript.delta") {
      const transcript = (msg as { delta?: string }).delta;
      if (transcript) {
        this.messageCallbacks.forEach(cb => cb(transcript));
      }
    }

    if (msg.type === "response.audio_transcript.done") {
      const transcript = (msg as { transcript?: string }).transcript;
      if (transcript) {
        this.messageCallbacks.forEach(cb => cb(transcript));
      }
    }

    if (msg.type === "response.audio.delta") {
      const delta = (msg as { delta?: string }).delta;
      if (delta) {
        // Decode base64 audio
        try {
          const audioData = Uint8Array.from(atob(delta), c => c.charCodeAt(0));
          this.audioCallbacks.forEach(cb => cb(audioData.buffer));
        } catch (error) {
          console.error("Failed to decode audio:", error);
        }
      }
    }

    if (msg.type === "response.function_call_arguments.done") {
      const functionCall = msg as { name?: string; arguments?: string };
      if (functionCall.name && functionCall.arguments) {
        try {
          const args = JSON.parse(functionCall.arguments);
          this.toolCallCallbacks.forEach(cb => cb(functionCall.name!, args));
        } catch (error) {
          console.error("Failed to parse tool call arguments:", error);
        }
      }
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStateChange("disconnected");
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Encode audio as base64
      const uint8Array = new Uint8Array(audioData);
      const base64 = btoa(String.fromCharCode(...uint8Array));
      
      this.ws.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64,
      }));
    }
  }

  onAudio(callback: (audio: ArrayBuffer) => void): void {
    this.audioCallbacks.push(callback);
  }

  onMessage(callback: (message: string) => void): void {
    this.messageCallbacks.push(callback);
  }

  onToolCall(callback: (tool: string, args: unknown) => void): void {
    this.toolCallCallbacks.push(callback);
  }

  onStateChange(callback: (state: "connecting" | "connected" | "disconnected" | "error") => void): void {
    this.stateCallbacks.push(callback);
  }

  private notifyStateChange(state: "connecting" | "connected" | "disconnected" | "error"): void {
    this.stateCallbacks.forEach(cb => cb(state));
  }
}

