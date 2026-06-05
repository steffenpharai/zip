"use client";

/**
 * RobotCameraPanel - Camera Stream Display
 * 
 * Displays MJPEG stream from camera module.
 * Note: Camera functionality requires separate camera service.
 */

import { useState, useCallback, useRef } from "react";

// Camera endpoints (disabled - ESP32 removed)
const CAMERA_BASE_URL = ""; // Disabled
const STREAM_URL = `${CAMERA_BASE_URL}:81/stream`;
const CAPTURE_URL = `${CAMERA_BASE_URL}/capture`;
const CONTROL_URL = `${CAMERA_BASE_URL}/control`;

// Frame size options
const FRAME_SIZES = [
  { label: "QVGA (320×240)", value: 4 },
  { label: "VGA (640×480)", value: 6 },
  { label: "SVGA (800×600)", value: 7 },
] as const;

interface RobotCameraPanelProps {
  disabled?: boolean;
}

export default function RobotCameraPanel({ disabled = false }: RobotCameraPanelProps) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState(7); // SVGA default
  const [showSettings, setShowSettings] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Handle stream load
  const handleLoad = useCallback(() => {
    setConnected(true);
    setError(null);
  }, []);

  // Handle stream error
  const handleError = useCallback(() => {
    setConnected(false);
    setError("Camera service not available");
  }, []);

  // Change frame size
  const handleFrameSizeChange = useCallback(async (size: number) => {
    setFrameSize(size);
    try {
      await fetch(`${CONTROL_URL}?var=framesize&val=${size}`, { mode: "no-cors" });
    } catch {
      // Ignore - no-cors mode doesn't return response
    }
  }, []);

  // Capture single frame
  const handleCapture = useCallback(async () => {
    try {
      const response = await fetch(CAPTURE_URL);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const a = document.createElement("a");
        a.href = url;
        a.download = `robot_capture_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      console.error("Failed to capture frame");
    }
  }, []);

  // Refresh stream
  const handleRefresh = useCallback(() => {
    if (imgRef.current) {
      // Force reload by appending timestamp
      const newSrc = `${STREAM_URL}?t=${Date.now()}`;
      imgRef.current.src = newSrc;
    }
  }, []);

  return (
    <div className="bg-panel-surface border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
            Camera
          </h4>
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-online-green" : "bg-text-muted"
            }`}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Settings Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            disabled={disabled}
            className="p-1.5 rounded text-text-muted hover:text-accent-cyan hover:bg-panel-surface-2 transition-colors disabled:opacity-50"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          {/* Capture Button */}
          <button
            onClick={handleCapture}
            disabled={disabled || !connected}
            className="p-1.5 rounded text-text-muted hover:text-accent-cyan hover:bg-panel-surface-2 transition-colors disabled:opacity-50"
            title="Capture Frame"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={disabled}
            className="p-1.5 rounded text-text-muted hover:text-accent-cyan hover:bg-panel-surface-2 transition-colors disabled:opacity-50"
            title="Refresh Stream"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 py-2 bg-panel-surface-2 border-b border-border/50">
          <div className="flex items-center gap-3">
            <label className="text-text-muted text-xs">Resolution:</label>
            <select
              value={frameSize}
              onChange={(e) => handleFrameSizeChange(parseInt(e.target.value, 10))}
              disabled={disabled}
              className="text-xs bg-panel-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-cyan"
            >
              {FRAME_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Video Stream */}
      <div className="relative aspect-video bg-black">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">{error}</span>
            <span className="text-xs mt-1 opacity-75">WiFi: ELEGOO-XXXX</span>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={STREAM_URL}
            alt="Robot Camera"
            className="w-full h-full object-contain"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
        
        {/* Loading overlay */}
        {!connected && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-2 text-text-muted">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm">Connecting...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

