/**
 * Realtime WebRTC Client for OpenAI Realtime API
 * 
 * Handles WebRTC connection, audio streaming, and bridge integration
 * Uses WebRTC for low-latency audio and WebSocket for control messages
 */

"use client";

export interface RealtimeWebRTCClient {
  connect(sessionId: string, ephemeralKey?: string): Promise<void>;
  disconnect(): void;
  sendAudio(audioData: ArrayBuffer): void;
  sendMessage(message: string): void;
  onAudio(callback: (audio: ArrayBuffer) => void): void;
  onTranscript(callback: (transcript: string, isFinal: boolean) => void): void;
  onMessage(callback: (message: string) => void): void;
  onToolCall(callback: (tool: string, args: unknown) => void): void;
  onStateChange(callback: (state: "connecting" | "connected" | "disconnected" | "error") => void): void;
  interrupt(): void; // Stop current speech for barge-in
}

interface RealtimeSessionInfo {
  sessionId: string;
  realtimeModel: string;
  expiresAt: number;
  ephemeralKey?: string;
}

export class RealtimeWebRTCClientImpl implements RealtimeWebRTCClient {
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  private audioCallbacks: Array<(audio: ArrayBuffer) => void> = [];
  private transcriptCallbacks: Array<(transcript: string, isFinal: boolean) => void> = [];
  private messageCallbacks: Array<(message: string) => void> = [];
  private toolCallCallbacks: Array<(tool: string, args: unknown) => void> = [];
  private stateCallbacks: Array<(state: "connecting" | "connected" | "disconnected" | "error") => void> = [];
  
  private sessionId: string | null = null;
  private isInterrupted = false;
  private currentTranscript = "";

  async connect(sessionId: string, ephemeralKey?: string): Promise<void> {
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

      const sessionInfo: RealtimeSessionInfo = await response.json();

      // For WebRTC, we'll use WebSocket for control and potentially WebRTC for audio
      // OpenAI Realtime API primarily uses WebSocket, but we can enhance with WebRTC for audio
      // Connect via WebSocket with ephemeral key if available
      const wsUrl = ephemeralKey
        ? `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(sessionInfo.realtimeModel)}&client_secret=${encodeURIComponent(ephemeralKey)}`
        : `/api/realtime/ws?session=${sessionId}&model=${encodeURIComponent(sessionInfo.realtimeModel)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.notifyStateChange("connected");
        
        // Send session configuration
        this.ws?.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: "You are Zip, an advanced AI assistant with a calm, precise, confident, and warm demeanor inspired by JARVIS from Iron Man. Be concise, direct, and helpful.",
            voice: "shimmer", // Valid Realtime API voice (warm, clear, professional)
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
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

      // Set up audio context for playback
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create audio element for remote audio playback
      this.remoteAudioElement = document.createElement("audio");
      this.remoteAudioElement.autoplay = true;
      document.body.appendChild(this.remoteAudioElement);

    } catch (error) {
      this.notifyStateChange("error");
      throw error;
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "object" || data === null) return;

    const msg = data as Record<string, unknown>;

    // Handle transcript events
    if (msg.type === "response.audio_transcript.delta") {
      const delta = (msg as { delta?: string }).delta;
      if (delta) {
        this.currentTranscript += delta;
        this.transcriptCallbacks.forEach(cb => cb(this.currentTranscript, false));
      }
    }

    if (msg.type === "response.audio_transcript.done") {
      const transcript = (msg as { transcript?: string }).transcript || this.currentTranscript;
      this.currentTranscript = "";
      this.transcriptCallbacks.forEach(cb => cb(transcript, true));
    }

    // Handle text messages
    if (msg.type === "response.text.delta") {
      const delta = (msg as { delta?: string }).delta;
      if (delta) {
        this.messageCallbacks.forEach(cb => cb(delta));
      }
    }

    if (msg.type === "response.text.done") {
      const text = (msg as { text?: string }).text;
      if (text) {
        this.messageCallbacks.forEach(cb => cb(text));
      }
    }

    // Handle audio chunks
    if (msg.type === "response.audio.delta") {
      const delta = (msg as { delta?: string }).delta;
      if (delta && !this.isInterrupted) {
        try {
          // Decode base64 audio
          const audioData = Uint8Array.from(atob(delta), c => c.charCodeAt(0));
          this.audioCallbacks.forEach(cb => cb(audioData.buffer));
        } catch (error) {
          console.error("Failed to decode audio:", error);
        }
      }
    }

    // Handle tool calls
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

    // Handle session events
    if (msg.type === "session.created") {
      // Session is ready
    }

    if (msg.type === "error") {
      const error = msg as { error?: { message?: string } };
      console.error("Realtime error:", error.error?.message);
      this.notifyStateChange("error");
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.remove();
      this.remoteAudioElement = null;
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

  sendMessage(message: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "assistant",
          content: message,
        },
      }));
    }
  }

  interrupt(): void {
    this.isInterrupted = true;
    
    // Stop audio playback
    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.currentTime = 0;
    }

    // Send interrupt signal to Realtime API
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "response.audio_transcript.cancel",
      }));
    }

    // Reset interrupt flag after a short delay
    setTimeout(() => {
      this.isInterrupted = false;
    }, 100);
  }

  onAudio(callback: (audio: ArrayBuffer) => void): void {
    this.audioCallbacks.push(callback);
  }

  onTranscript(callback: (transcript: string, isFinal: boolean) => void): void {
    this.transcriptCallbacks.push(callback);
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

