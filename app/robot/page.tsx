"use client";

/**
 * Robot Diagnostics Page
 * 
 * Comprehensive robot control and monitoring center.
 * Features: Connection status, motion control, motor gauges,
 * sensor display, and streaming controls.
 * 
 * Communication is via WebSocket to bridge, which forwards to UNO via serial port.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRobot } from "@/hooks/useRobot";
import {
  MotionControl,
  SensorDisplay,
  ConnectionStatus,
  MotorGauges,
  RobotCameraPanel,
  ServoControl,
} from "@/components/robot";
import type { RobotSensors, RobotStatusResponse } from "@/lib/robot/types";

export default function RobotPage() {
  const {
    state,
    connection,
    isReady,
    isStreaming,
    connect,
    disconnect,
    checkHealth,
    stop,
    move,
    setServo,
    startStreaming,
    stopStreaming,
    getDiagnostics,
    getSensors,
  } = useRobot({ autoConnect: true, diagnosticsPollingMs: 2000 });

  const [status, setStatus] = useState<RobotStatusResponse | null>(null);
  const [sensors, setSensors] = useState<RobotSensors>({
    ultrasonic: null,
    lineSensor: null,
    battery: null,
  });
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [streamSettings, setStreamSettings] = useState({
    rateHz: 10,
    ttlMs: 200,
    velocity: 100,
    turnRate: 80,
  });

  // Fetch status on mount and periodically
  useEffect(() => {
    const fetchStatus = async () => {
      const bridgeStatus = await checkHealth();
      if (bridgeStatus) {
        // Convert BridgeStatusResponse to RobotStatusResponse
        const robotStatus: RobotStatusResponse = {
          connected: bridgeStatus.ready && bridgeStatus.serialOpen,
          rxBytes: bridgeStatus.rxBytes,
          txBytes: bridgeStatus.txBytes,
          commands: 0, // Not available from bridge status
          errors: 0, // Not available from bridge status
          uptime: bridgeStatus.uptime,
          lastResponseMs: bridgeStatus.lastRxAt ? Date.now() - bridgeStatus.lastRxAt : -1,
        };
        setStatus(robotStatus);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    const bridgeStatus = await checkHealth();
    if (bridgeStatus) {
      // Convert BridgeStatusResponse to RobotStatusResponse
      const robotStatus: RobotStatusResponse = {
        connected: bridgeStatus.ready && bridgeStatus.serialOpen,
        rxBytes: bridgeStatus.rxBytes,
        txBytes: bridgeStatus.txBytes,
        commands: 0, // Not available from bridge status
        errors: 0, // Not available from bridge status
        uptime: bridgeStatus.uptime,
        lastResponseMs: bridgeStatus.lastRxAt ? Date.now() - bridgeStatus.lastRxAt : -1,
      };
      setStatus(robotStatus);
    }
  }, [checkHealth]);

  // Handle motion control
  const handleMove = useCallback(async (v: number, w: number) => {
    await move(v, w);
  }, [move]);

  const handleStop = useCallback(async () => {
    if (isStreaming) {
      stopStreaming(true);
    } else {
      await stop();
    }
  }, [isStreaming, stop, stopStreaming]);

  // Handle streaming toggle
  const handleStreamingToggle = useCallback(() => {
    if (isStreaming) {
      stopStreaming(true);
    } else {
      startStreaming(
        streamSettings.velocity,
        streamSettings.turnRate,
        {
          rateHz: streamSettings.rateHz,
          ttlMs: streamSettings.ttlMs,
        }
      );
    }
  }, [isStreaming, startStreaming, stopStreaming, streamSettings]);

  // Fetch sensors
  const handleRefreshSensors = useCallback(async () => {
    setSensorsLoading(true);
    try {
      const s = await getSensors();
      setSensors(s);
    } catch (error) {
      console.error("Failed to fetch sensors:", error);
    } finally {
      setSensorsLoading(false);
    }
  }, [getSensors]);

  // Fetch diagnostics
  const handleRefreshDiagnostics = useCallback(async () => {
    await getDiagnostics();
  }, [getDiagnostics]);

  return (
    <div className="min-h-screen bg-background text-text-primary">
      {/* Header */}
      <header className="bg-panel-surface border-b border-border px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-text-muted hover:text-accent-cyan transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to HUD</span>
            </Link>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold tracking-wide">
              <span className="text-accent-cyan">ZIP</span> Robot Diagnostics
            </h1>
            <span className="text-xs text-text-muted bg-panel-surface-2 px-2 py-1 rounded">WiFi Mode</span>
          </div>

          {/* Emergency Stop Button */}
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors font-semibold"
          >
            EMERGENCY STOP
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Camera, Connection & Motion */}
          <div className="space-y-6">
            {/* Camera Stream */}
            <RobotCameraPanel disabled={false} />

            {/* Connection Status */}
            <ConnectionStatus
              connection={connection}
              status={status}
              onRefresh={handleRefresh}
            />

            {/* Motion Control */}
            <div className="bg-panel-surface border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                  Motion Control
                </h4>
                <div className={`flex items-center gap-2 text-xs ${isStreaming ? "text-accent-cyan" : "text-text-muted"}`}>
                  <span className={`w-2 h-2 rounded-full ${isStreaming ? "bg-accent-cyan animate-pulse" : "bg-text-muted"}`} />
                  {isStreaming ? "Streaming" : "Manual"}
                </div>
              </div>
              <MotionControl
                onMove={handleMove}
                onStop={handleStop}
                disabled={!isReady}
                isStreaming={isStreaming}
              />
            </div>

            {/* Servo Control */}
            <ServoControl
              onSetAngle={setServo}
              disabled={!isReady}
              initialAngle={90}
            />

            {/* Streaming Controls */}
            <div className="bg-panel-surface border border-border rounded-lg p-4 space-y-4">
              <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                Streaming Controls
              </h4>
              
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">Rate (Hz)</span>
                    <span className="text-text-primary font-mono">{streamSettings.rateHz}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={streamSettings.rateHz}
                    onChange={(e) => setStreamSettings(s => ({ ...s, rateHz: parseInt(e.target.value, 10) }))}
                    disabled={isStreaming}
                    className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-text-muted">TTL (ms)</span>
                    <span className="text-text-primary font-mono">{streamSettings.ttlMs}</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="300"
                    step="10"
                    value={streamSettings.ttlMs}
                    onChange={(e) => setStreamSettings(s => ({ ...s, ttlMs: parseInt(e.target.value, 10) }))}
                    disabled={isStreaming}
                    className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan"
                  />
                </div>
              </div>

              <button
                onClick={handleStreamingToggle}
                disabled={!isReady}
                className={`w-full py-2 rounded-lg font-medium transition-colors ${
                  isStreaming
                    ? "bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500/30"
                    : "bg-accent-cyan/20 border border-accent-cyan text-accent-cyan hover:bg-accent-cyan/30"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isStreaming ? "Stop Streaming" : "Start Streaming"}
              </button>
            </div>
          </div>

          {/* Middle Column - Motor Status */}
          <div className="space-y-6">
            {/* Motor Gauges */}
            <MotorGauges
              diagnostics={state.diagnostics}
              loading={!isReady}
            />

            {/* Refresh Diagnostics */}
            <button
              onClick={handleRefreshDiagnostics}
              disabled={!isReady}
              className="w-full py-2 bg-panel-surface border border-border rounded-lg text-text-muted hover:text-accent-cyan hover:border-accent-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Refresh Diagnostics
            </button>
          </div>

          {/* Right Column - Sensors */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
                Sensors
              </h3>
              <button
                onClick={handleRefreshSensors}
                disabled={!isReady || sensorsLoading}
                className="text-xs text-accent-cyan hover:text-accent-cyan-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sensorsLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <SensorDisplay
              sensors={sensors}
              loading={sensorsLoading}
            />
          </div>
        </div>

        {/* Statistics Footer */}
        {status && (
          <div className="mt-6 bg-panel-surface border border-border rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">RX Bytes</div>
                <div className="text-online-green font-mono text-lg">
                  {status.rxBytes.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">TX Bytes</div>
                <div className="text-accent-cyan font-mono text-lg">
                  {status.txBytes.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Commands</div>
                <div className="text-text-primary font-mono text-lg">
                  {status.commands}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Errors</div>
                <div className={`font-mono text-lg ${status.errors > 0 ? "text-yellow-500" : "text-text-primary"}`}>
                  {status.errors}
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Uptime</div>
                <div className="text-text-primary font-mono text-lg">
                  {Math.floor(status.uptime / 1000)}s
                </div>
              </div>
              <div>
                <div className="text-text-muted text-xs uppercase tracking-wide">Status</div>
                <div className={`font-mono text-lg ${status.connected ? "text-online-green" : "text-yellow-500"}`}>
                  {status.connected ? "Connected" : "No Response"}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
