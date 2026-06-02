"use client";

import { useReducer, useCallback, useEffect } from "react";
import { ZIP_MODES, type ZipMode } from "@/lib/constants";
import { useEmitEvent, useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";

export interface HudState {
  mode: ZipMode;
  isOnline: boolean;
  activeTool?: string;
  cameraEnabled: boolean;
  micEnabled: boolean;
  sessionStartTime: number;
  commandsCount: number;
  lastSpeechLevel: number;
  isSpeakingTelemetryActive: boolean;
  lastSpeechSource?: "realtime" | "tts";
}

type HudAction =
  | { type: "SET_MODE"; mode: ZipMode }
  | { type: "SET_ONLINE"; isOnline: boolean }
  | { type: "SET_ACTIVE_TOOL"; tool?: string }
  | { type: "TOGGLE_CAMERA" }
  | { type: "TOGGLE_MIC" }
  | { type: "INCREMENT_COMMAND" }
  | { type: "RESET_SESSION" }
  | { type: "SET_SPEECH_LEVEL"; level: number }
  | { type: "SET_SPEECH_ACTIVE"; active: boolean; source?: "realtime" | "tts" };

const initialState: HudState = {
  mode: ZIP_MODES.IDLE,
  isOnline: true,
  cameraEnabled: false,
  micEnabled: false,
  sessionStartTime: Date.now(),
  commandsCount: 0,
  lastSpeechLevel: 0,
  isSpeakingTelemetryActive: false,
  lastSpeechSource: undefined,
};

function hudReducer(state: HudState, action: HudAction): HudState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_ONLINE":
      return { ...state, isOnline: action.isOnline };
    case "SET_ACTIVE_TOOL":
      return { ...state, activeTool: action.tool };
    case "TOGGLE_CAMERA":
      return { ...state, cameraEnabled: !state.cameraEnabled };
    case "TOGGLE_MIC":
      return { ...state, micEnabled: !state.micEnabled };
    case "INCREMENT_COMMAND":
      return { ...state, commandsCount: state.commandsCount + 1 };
    case "RESET_SESSION":
      return {
        ...state,
        commandsCount: 0,
        sessionStartTime: Date.now(),
      };
    case "SET_SPEECH_LEVEL":
      return { ...state, lastSpeechLevel: action.level };
    case "SET_SPEECH_ACTIVE":
      return {
        ...state,
        isSpeakingTelemetryActive: action.active,
        lastSpeechSource: action.source,
      };
    default:
      return state;
  }
}

export function useHudStore() {
  const [state, dispatch] = useReducer(hudReducer, initialState);
  const emit = useEmitEvent();

  // Subscribe to speech telemetry events
  useEventBus((event: ZipEvent) => {
    if (event.type === "speech.start") {
      dispatch({
        type: "SET_SPEECH_ACTIVE",
        active: true,
        source: event.source,
      });
    } else if (event.type === "speech.level") {
      dispatch({
        type: "SET_SPEECH_LEVEL",
        level: event.level,
      });
    } else if (event.type === "speech.end") {
      dispatch({
        type: "SET_SPEECH_ACTIVE",
        active: false,
        source: undefined,
      });
      dispatch({
        type: "SET_SPEECH_LEVEL",
        level: 0,
      });
    }
  });

  const setMode = useCallback(
    (mode: ZipMode) => {
      dispatch({ type: "SET_MODE", mode });
      emit({
        type: "zip.state",
        mode,
        isOnline: state.isOnline,
        activeTool: state.activeTool,
      });
    },
    [emit, state.isOnline, state.activeTool]
  );

  const setOnline = useCallback(
    (isOnline: boolean) => {
      dispatch({ type: "SET_ONLINE", isOnline });
      emit({
        type: "zip.state",
        mode: state.mode,
        isOnline,
        activeTool: state.activeTool,
      });
    },
    [emit, state.mode, state.activeTool]
  );

  const setActiveTool = useCallback(
    (tool?: string) => {
      dispatch({ type: "SET_ACTIVE_TOOL", tool });
      emit({
        type: "zip.state",
        mode: state.mode,
        isOnline: state.isOnline,
        activeTool: tool,
      });
    },
    [emit, state.mode, state.isOnline]
  );

  const toggleCamera = useCallback(() => {
    dispatch({ type: "TOGGLE_CAMERA" });
  }, []);

  const toggleMic = useCallback(() => {
    dispatch({ type: "TOGGLE_MIC" });
  }, []);

  const incrementCommand = useCallback(() => {
    dispatch({ type: "INCREMENT_COMMAND" });
  }, []);

  const resetSession = useCallback(() => {
    dispatch({ type: "RESET_SESSION" });
    emit({
      type: "toast",
      level: "info",
      text: "Session reset",
      ts: Date.now(),
    });
  }, [emit]);

  const setSpeechLevel = useCallback((level: number) => {
    dispatch({ type: "SET_SPEECH_LEVEL", level });
  }, []);

  const setSpeechActive = useCallback(
    (active: boolean, source?: "realtime" | "tts") => {
      dispatch({ type: "SET_SPEECH_ACTIVE", active, source });
    },
    []
  );

  return {
    state,
    setMode,
    setOnline,
    setActiveTool,
    toggleCamera,
    toggleMic,
    incrementCommand,
    resetSession,
    setSpeechLevel,
    setSpeechActive,
  };
}

