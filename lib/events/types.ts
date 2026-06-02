import { ZIP_MODES, type ZipMode } from "@/lib/constants";

export type PanelType = "system" | "weather" | "weather_error" | "camera" | "uptime" | "printer" | "printer_error" | "robot" | "robot_error";

// Tool card payload types
export type VisionToolCardPayload = {
  type: "vision";
  imageUrl?: string;
  analysis: string;
  objects?: Array<{ name: string; confidence?: number }>;
  text?: string;
};

export type ResearchToolCardPayload = {
  type: "research";
  query: string;
  sources: Array<{ title: string; url: string; snippet: string }>;
  summary: string;
  citations: Array<{ url: string; title: string; quote: string }>;
};

export type DocumentToolCardPayload = {
  type: "document";
  action: "ingest" | "search" | "answer";
  docId?: string;
  filename?: string;
  chunks?: Array<{ id: string; text: string; relevance: number }>;
  answer?: string;
  citations?: Array<{ docId: string; filename: string; chunkId: string }>;
};

export type UrlToolCardPayload = {
  type: "url";
  url: string;
  action: "open";
};

export type RobotToolCardPayload = {
  type: "robot";
  action: "move" | "stop" | "stream_start" | "stream_stop" | "sensors" | "diagnostics";
  success: boolean;
  data?: {
    velocity?: number;
    turnRate?: number;
    motorLeft?: number;
    motorRight?: number;
    streaming?: boolean;
    sensors?: {
      ultrasonic?: number | null;
      lineSensor?: { left: number; middle: number; right: number };
      battery?: { voltage: number; percent: number };
    };
  };
  message?: string;
  error?: string;
};

export type ToolCardPayload =
  | VisionToolCardPayload
  | ResearchToolCardPayload
  | DocumentToolCardPayload
  | UrlToolCardPayload
  | RobotToolCardPayload
  | { type: string; [key: string]: unknown };

export type BrainActivityEvent = {
  type: "brain.activity";
  activity: {
    node?: string; // "input" | "memory" | "router" | "direct" | "research" | "workflow" | "finalize"
    action: "node.enter" | "node.exit" | "tool.start" | "tool.complete" | "llm.call" | "state.update";
    tool?: string;
    toolInput?: unknown;
    toolOutput?: unknown;
    llmModel?: string;
    llmPrompt?: string;
    stateChange?: { field: string; value: unknown };
    timestamp: number;
    requestId: string;
  };
  ts: number;
};

export type BrainStreamEvent = {
  type: "brain.stream";
  delta: string;
  done: boolean;
  ts: number;
  messageId?: string; // Optional messageId for the first delta to track the message
};

export type ZipEvent =
  | {
      type: "zip.state";
      mode: ZipMode;
      isOnline: boolean;
      activeTool?: string;
    }
  | {
      type: "chat.message";
      id: string;
      role: "user" | "assistant";
      text: string;
      ts: number;
    }
  | {
      type: "chat.clear";
      ts: number;
    }
  | {
      type: "panel.update";
      panel: PanelType;
      payload: unknown;
      ts: number;
    }
  | {
      type: "tool.card";
      toolType: string;
      payload: ToolCardPayload;
      ts: number;
    }
  | {
      type: "toast";
      level: "info" | "warn" | "error";
      text: string;
      ts: number;
    }
  | {
      type: "speech.start";
      source: "realtime" | "tts";
      messageId?: string;
      traceId?: string;
      startedAt: number;
    }
  | {
      type: "speech.level";
      level: number; // 0..1 RMS (smoothed)
      at: number; // performance.now() or Date.now()
    }
  | {
      type: "speech.end";
      source: "realtime" | "tts";
      messageId?: string;
      traceId?: string;
      endedAt: number;
    }
  | BrainActivityEvent
  | BrainStreamEvent;

export type EventHandler = (event: ZipEvent) => void;

