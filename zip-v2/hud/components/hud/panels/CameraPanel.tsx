"use client";

import { useState } from "react";
import { useEventBus } from "@/lib/events/hooks";
import { useHudStore } from "@/lib/state/hudStore";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";
import { getVoicePersona } from "@/lib/voice/voicePersona";

type Tab = "camera" | "voice";
type VoiceOption = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "cedar" | "marin";

export default function CameraPanel() {
  const { state, toggleCamera, toggleMic } = useHudStore();
  const [activeTab, setActiveTab] = useState<Tab>("camera");
  const [cameraState, setCameraState] = useState<{ enabled: boolean } | null>(
    null
  );
  
  // Voice settings state
  const voicePersona = getVoicePersona();
  const [voiceModel, setVoiceModel] = useState<VoiceOption>(voicePersona.ttsVoice);
  const [speechSpeed, setSpeechSpeed] = useState<number>(voicePersona.ttsSpeed);

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "camera") {
      setCameraState(event.payload as { enabled: boolean });
    }
  });

  const cameraEnabled = cameraState?.enabled ?? state.cameraEnabled;

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
        Media
      </h4>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab("camera")}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === "camera"
              ? "text-text-primary border-b-2 border-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Camera
        </button>
        <button
          onClick={() => setActiveTab("voice")}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === "voice"
              ? "text-text-primary border-b-2 border-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Voice
        </button>
      </div>

      {/* Camera Tab */}
      {activeTab === "camera" && (
        <div className="flex items-center justify-center h-24 bg-panel-surface rounded-md border border-border">
          <button
            onClick={toggleCamera}
            className={`w-12 h-12 rounded-md border flex items-center justify-center transition-colors ${
              cameraEnabled
                ? "bg-accent-cyan/20 border-accent-cyan text-accent-cyan"
                : "bg-panel-surface-2 border-border text-text-muted hover:bg-panel-surface-2"
            }`}
            aria-label="Toggle camera"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Voice Tab */}
      {activeTab === "voice" && (
        <div className="space-y-4">
          <div className="flex items-center justify-center h-24 bg-panel-surface rounded-md border border-border">
            <button
              onClick={toggleMic}
              className={`w-12 h-12 rounded-md border flex items-center justify-center transition-colors ${
                state.micEnabled
                  ? "bg-accent-cyan/20 border-accent-cyan text-accent-cyan"
                  : "bg-panel-surface-2 border-border text-text-muted hover:bg-panel-surface-2"
              }`}
              aria-label="Toggle microphone"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
          </div>

          {/* Voice Settings */}
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Voice Model
              </label>
              <select
                value={voiceModel}
                onChange={(e) => setVoiceModel(e.target.value as VoiceOption)}
                className="w-full px-3 py-2 text-sm bg-panel-surface border border-border rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-cyan/50"
              >
                <option value="alloy">Alloy</option>
                <option value="echo">Echo</option>
                <option value="fable">Fable</option>
                <option value="onyx">Onyx</option>
                <option value="nova">Nova</option>
                <option value="shimmer">Shimmer</option>
                <option value="cedar">Cedar</option>
                <option value="marin">Marin</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-text-muted text-xs font-medium uppercase tracking-wide">
                Speech Speed
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.05"
                  value={speechSpeed}
                  onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                />
                <span className="text-text-primary text-xs font-mono w-12 text-right">
                  {speechSpeed.toFixed(2)}x
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-text-muted text-xs">Status</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    state.micEnabled ? "bg-online-green" : "bg-text-muted"
                  }`}
                />
                <span className="text-text-muted text-xs">
                  {state.micEnabled ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

