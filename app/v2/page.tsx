"use client";

/**
 * ZIP V2 — Operator Console (Phase 2).
 *
 * Wires the WS connection, drive input, telemetry sparklines, latency
 * monitor, and event log into the cockpit layout. No camera, no agent,
 * no map yet — those panels are deliberate visual stubs the design system
 * will inherit when their data flows land in later phases.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

import { AgentRail } from "@/components/v2/AgentRail";
import { CameraFeed } from "@/components/v2/CameraFeed";
import { DrivePanel } from "@/components/v2/DrivePanel";
import { EventLog } from "@/components/v2/EventLog";
import { HudShell } from "@/components/v2/HudShell";
import { MissionBar } from "@/components/v2/MissionBar";
import { TelemetryPanel } from "@/components/v2/TelemetryPanel";
import { ViewportFrame } from "@/components/v2/ViewportFrame";
import { WorldView3D } from "@/components/v2/WorldView3D";

import { useDriveInput } from "@/lib/v2/useDriveInput";
import { useDriveTick } from "@/lib/v2/useDriveTick";
import { useEventLog } from "@/lib/v2/useEventLog";
import { useFps } from "@/lib/v2/useFps";
import { useLatency } from "@/lib/v2/useLatency";
import { useParallelWsBus } from "@/lib/v2/useServerMessages";
import { useSparkSeries } from "@/lib/v2/useSparkSeries";
import { useUptime } from "@/lib/v2/useUptime";
import { useZipBrain } from "@/lib/v2/useZipBrain";

export default function V2Page() {
  const { state, send, reconnect, url } = useZipBrain();
  const { events, log } = useEventLog();
  const fps = useFps();
  const uptime = useUptime();

  // ----- drive input + send loop -----
  const sendStopRef = useRef<() => void>(() => {});
  const driveInput = useDriveInput({
    onStop: () => {
      sendStopRef.current();
    },
  });
  const stopOnce = useCallback(() => {
    send({ type: "stop" });
    log("crit", "ESTOP issued");
  }, [send, log]);
  sendStopRef.current = stopOnce;

  // Keep the latest axes accessible from the 20Hz tick without re-creating.
  const axesRef = useRef(driveInput.axes);
  axesRef.current = driveInput.axes;
  useDriveTick(axesRef, send);

  // ----- side-channel WS for latency / acks -----
  // We use a small parallel WebSocket whose only job is forwarding messages
  // into the bus. Cheap; the brain accepts multiple clients.
  const bus = useParallelWsBus(url);
  const latency = useLatency(send, bus.register, 1500);

  // ----- sparkline series -----
  const battery = useSparkSeries(64);
  const ultrasonic = useSparkSeries(64);
  const lastBatRef = useRef<number | null>(null);
  const lastUltraRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.batteryMv != null && state.batteryMv !== lastBatRef.current) {
      lastBatRef.current = state.batteryMv;
      battery.push(state.batteryMv);
    }
    if (
      state.ultrasonicCm != null &&
      state.ultrasonicCm !== lastUltraRef.current
    ) {
      lastUltraRef.current = state.ultrasonicCm;
      ultrasonic.push(state.ultrasonicCm);
    }
  }, [state.batteryMv, state.ultrasonicCm, battery, ultrasonic]);

  // ----- event log: turn connection/uno transitions into entries -----
  const prevConn = useRef(state.connection);
  const prevUno = useRef(state.unoConnected);
  useEffect(() => {
    if (prevConn.current !== state.connection) {
      log(
        state.connection === "open" ? "link" : "warn",
        `Brain link: ${state.connection.toUpperCase()}`,
      );
      prevConn.current = state.connection;
    }
    if (prevUno.current !== state.unoConnected) {
      log(
        state.unoConnected ? "link" : "warn",
        `UNO link: ${state.unoConnected ? "ATTACHED" : "DETACHED"}`,
      );
      prevUno.current = state.unoConnected;
    }
  }, [state.connection, state.unoConnected, log]);

  // Memoize axes object identity so child renders are stable
  const axes = useMemo(
    () => ({ v: driveInput.axes.v, w: driveInput.axes.w }),
    [driveInput.axes.v, driveInput.axes.w],
  );

  return (
    <HudShell
      mission={
        <MissionBar
          connection={state.connection}
          unoConnected={state.unoConnected}
          unoPort={state.unoPort}
          url={url}
          protocolVersion={state.protocolVersion}
          serviceVersion={state.serviceVersion}
          fps={fps}
          latencyMs={latency}
          uptimeS={uptime}
          onReconnect={reconnect}
        />
      }
      left={
        <TelemetryPanel
          batteryMv={state.batteryMv}
          ultrasonicCm={state.ultrasonicCm}
          batterySeries={battery.series}
          ultrasonicSeries={ultrasonic.series}
          axes={axes}
        />
      }
      center={
        <>
          {/* The 3D viewport is the HERO — fills all remaining vertical space. */}
          <div className="flex-1 min-h-0 relative zip-bezel overflow-hidden">
            <ViewportFrame
              callsign="VIEW // WORLD"
              topRight={
                <>
                  <span>3D / SIM</span>
                  <span className="zip-num text-[var(--v2-text)]">{Math.round(fps)} fps</span>
                </>
              }
              bottomLeft={
                <>
                  <span>ENV · VOID</span>
                  <span className="zip-num text-[var(--v2-text)]">x 0.00 y 0.00 yaw 0.00</span>
                </>
              }
              bottomRight={
                <>
                  <span>ULTRA</span>
                  <span className="zip-num text-[var(--v2-text)]">
                    {state.ultrasonicCm == null ? "—" : `${state.ultrasonicCm}cm`}
                  </span>
                </>
              }
            >
              <WorldView3D axes={axes} ultrasonicCm={state.ultrasonicCm} />
            </ViewportFrame>
          </div>
          {/* Compact camera strip BELOW the hero — fixed height regardless of column width */}
          <div className="h-44 shrink-0">
            <CameraFeed />
          </div>
        </>
      }
      right={
        <div className="flex flex-col gap-3">
          <DrivePanel
            axes={axes}
            keys={driveInput.keys}
            onJoystick={driveInput.setJoystick}
            onStop={stopOnce}
            send={send}
          />
          <AgentRail />
        </div>
      }
      bottom={<EventLog events={events} rawLog={state.rawLog} />}
    />
  );
}
