/**
 * React hook for the V2 WebSocket connection to the on-robot Jetson service.
 *
 * Responsibilities:
 *   - Open/maintain a single WebSocket to the brain
 *   - Auto-reconnect with exponential backoff on disconnect
 *   - Apply incoming messages to a single robot-state object
 *   - Expose a typed `send()` for the HUD to issue commands
 *
 * Deliberately no global state library — the HUD currently has exactly one
 * connection per browser tab. Reach for Zustand/Jotai if that changes.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ClientMessage,
  ConnectionState,
  RobotState,
  ServerMessage,
  UnoRawMsg,
} from "./types";

const RAW_LOG_MAX = 100;
const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8000;

export interface UseZipBrainOptions {
  /** Override the WS URL. Default: env var `NEXT_PUBLIC_ZIP_WS_URL` or `ws://192.168.55.1:8080/ws`. */
  url?: string;
}

export interface ZipBrain {
  state: RobotState;
  send: (msg: ClientMessage) => void;
  /** Force-close + reconnect immediately. */
  reconnect: () => void;
  url: string;
}

function defaultUrl(): string {
  if (typeof window === "undefined") return "ws://192.168.55.1:8080/ws";
  const envUrl = process.env.NEXT_PUBLIC_ZIP_WS_URL;
  if (envUrl) return envUrl;
  // If the page itself is loaded from the Jetson someday, default to same-host.
  // For local dev served from the PC, fall back to the USB-C bridge IP.
  return "ws://192.168.55.1:8080/ws";
}

function initialState(): RobotState {
  return {
    connection: "connecting",
    unoConnected: false,
    unoPort: "",
    protocolVersion: "",
    serviceVersion: "",
    batteryMv: null,
    ultrasonicCm: null,
    lastTelemetryTs: null,
    rawLog: [],
  };
}

export function useZipBrain(opts: UseZipBrainOptions = {}): ZipBrain {
  const url = useMemo(() => opts.url ?? defaultUrl(), [opts.url]);
  const [state, setState] = useState<RobotState>(initialState);

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(RECONNECT_INITIAL_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  const setConnection = useCallback((c: ConnectionState) => {
    setState((s) => (s.connection === c ? s : { ...s, connection: c }));
  }, []);

  const apply = useCallback((msg: ServerMessage) => {
    setState((s) => {
      switch (msg.type) {
        case "hello":
          return {
            ...s,
            connection: "open",
            unoConnected: msg.uno_connected,
            unoPort: msg.uno_port,
            protocolVersion: msg.protocol_version,
            serviceVersion: msg.service_version,
          };
        case "telemetry":
          return {
            ...s,
            batteryMv: msg.battery_mv,
            ultrasonicCm: msg.ultrasonic_cm,
            lastTelemetryTs: msg.ts,
          };
        case "uno_status":
          return { ...s, unoConnected: msg.connected, unoPort: msg.port };
        case "uno_raw": {
          const log: UnoRawMsg[] = [...s.rawLog, msg].slice(-RAW_LOG_MAX);
          return { ...s, rawLog: log };
        }
        case "ack":
        case "pong":
        case "error":
        case "detections":
        case "snapshot":
          return s; // handled elsewhere (latency hook / useDetections via the parallel bus)
        default:
          // Never return undefined from the reducer — an unknown/race-loaded
          // message type would otherwise nuke RobotState and crash the next
          // `s.rawLog` read. Ignore anything we don't recognise.
          return s;
      }
    });
  }, []);

  const open = useCallback(() => {
    intentionalCloseRef.current = false;
    setConnection("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.warn("[zip-brain] ws ctor failed", e);
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      backoffRef.current = RECONNECT_INITIAL_MS;
      setConnection("open");
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        apply(msg);
      } catch (e) {
        console.warn("[zip-brain] bad json", e, ev.data);
      }
    };
    ws.onclose = () => {
      wsRef.current = null;
      if (intentionalCloseRef.current) {
        setConnection("closed");
        return;
      }
      setConnection("reconnecting");
      scheduleReconnect();
    };
    ws.onerror = (ev) => {
      console.warn("[zip-brain] ws error", ev);
      // onclose will fire after; reconnect logic lives there.
    };
  }, [apply, setConnection, url]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, RECONNECT_MAX_MS);
    reconnectTimerRef.current = setTimeout(() => {
      open();
    }, delay);
  }, [open]);

  // initial connect + cleanup
  useEffect(() => {
    open();
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close(1000, "unmount");
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      console.warn("[zip-brain] send failed", e);
    }
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      intentionalCloseRef.current = false;
      wsRef.current.close(1000, "manual reconnect");
    } else {
      backoffRef.current = RECONNECT_INITIAL_MS;
      open();
    }
  }, [open]);

  return { state, send, reconnect, url };
}
