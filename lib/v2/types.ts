/**
 * Wire format for the V2 control plane (matches zip-brain/control_plane.py).
 *
 * The Jetson speaks WebSocket JSON. We define the message envelopes here so
 * the HUD has type safety end to end. If the Python side changes a field,
 * grep for the corresponding TS interface and update.
 */

export const PROTOCOL_VERSION = "v2.0";

/* -------------------------------------------------------------------------- */
/* Client → Server                                                            */
/* -------------------------------------------------------------------------- */

export type ClientMessage =
  | { type: "drive"; id?: string; v: number; w: number; ttl_ms: number }
  | { type: "stop"; id?: string }
  | {
      type: "macro";
      id?: string;
      macro_id: 1 | 2 | 3 | 4;
      intensity: number;
      ttl_ms: number;
    }
  | { type: "ping"; id?: string }
  | { type: "perception"; id?: string; enabled: boolean };

/* -------------------------------------------------------------------------- */
/* Server → Client                                                            */
/* -------------------------------------------------------------------------- */

export interface HelloMsg {
  type: "hello";
  protocol_version: string;
  service_version: string;
  uno_connected: boolean;
  uno_port: string;
  ts: number;
}

export interface TelemetryMsg {
  type: "telemetry";
  battery_mv: number | null;
  ultrasonic_cm: number | null;
  ts: number;
}

export interface UnoStatusMsg {
  type: "uno_status";
  connected: boolean;
  port: string;
}

export interface UnoRawMsg {
  type: "uno_raw";
  direction: "in" | "out";
  line: string;
  ts: number;
}

export interface PongMsg {
  type: "pong";
  id?: string;
  ts: number;
}

export interface AckMsg {
  type: "ack";
  id?: string;
  ok: boolean;
  error?: string;
}

export interface ErrorMsg {
  type: "error";
  error: string;
}

/* -------------------------------------------------------------------------- */
/* Perception (Phase 4)                                                       */
/* -------------------------------------------------------------------------- */

export interface Detection {
  label: string;
  confidence: number;
  /** [x, y, w, h] in the detector's frame pixel coords (frame_w × frame_h). */
  box: [number, number, number, number];
  class_id: number;
}

export interface DetectionsMsg {
  type: "detections";
  detections: Detection[];
  frame_w: number;
  frame_h: number;
  seq: number;
  ts: number;
  infer_ms: number;
  backend: string;
}

export interface SnapshotMsg {
  type: "snapshot";
  id: string;
  label: string;
  confidence: number;
  box: [number, number, number, number];
  w: number;
  h: number;
  ts: number;
}

export type ServerMessage =
  | HelloMsg
  | TelemetryMsg
  | UnoStatusMsg
  | UnoRawMsg
  | PongMsg
  | AckMsg
  | ErrorMsg
  | DetectionsMsg
  | SnapshotMsg;

/* -------------------------------------------------------------------------- */
/* HUD-side derived state                                                     */
/* -------------------------------------------------------------------------- */

export type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface RobotState {
  connection: ConnectionState;
  unoConnected: boolean;
  unoPort: string;
  protocolVersion: string;
  serviceVersion: string;
  batteryMv: number | null;
  ultrasonicCm: number | null;
  lastTelemetryTs: number | null;
  /** Bounded ring buffer of recent raw UART traffic for the debug panel. */
  rawLog: UnoRawMsg[];
}
