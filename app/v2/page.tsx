"use client";

/**
 * ZIP V2 — Operator Console (Phase 2).
 *
 * Wires the WS connection, drive input, telemetry sparklines, latency
 * monitor, and event log into the cockpit layout. No camera, no agent,
 * no map yet — those panels are deliberate visual stubs the design system
 * will inherit when their data flows land in later phases.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentRail } from "@/components/v2/AgentRail";
import { CameraFeed } from "@/components/v2/CameraFeed";
import { DetectionOverlay } from "@/components/v2/DetectionOverlay";
import { DrivePanel } from "@/components/v2/DrivePanel";
import { EventLog } from "@/components/v2/EventLog";
import { HudShell } from "@/components/v2/HudShell";
import { MissionBar } from "@/components/v2/MissionBar";
import { RadarPanel } from "@/components/v2/RadarPanel";
import { SnapshotGallery } from "@/components/v2/SnapshotGallery";
import { TelemetryPanel } from "@/components/v2/TelemetryPanel";
import { ViewportFrame } from "@/components/v2/ViewportFrame";

import { brainHttpBase, camStreamUrl } from "@/lib/v2/brainUrl";
import { MapView } from "@/components/v2/MapView";
import { useDetections } from "@/lib/v2/useDetections";
import { useMap } from "@/lib/v2/useMap";
import { usePlan } from "@/lib/v2/usePlan";
import { useSensors } from "@/lib/v2/useSensors";
import { useCameraSources } from "@/lib/v2/useCameraSources";
import { useDriveInput } from "@/lib/v2/useDriveInput";
import { useDriveTick } from "@/lib/v2/useDriveTick";
import { useEventLog } from "@/lib/v2/useEventLog";
import { useFps } from "@/lib/v2/useFps";
import { useLatency } from "@/lib/v2/useLatency";
import { useParallelWsBus } from "@/lib/v2/useServerMessages";
import { useSparkSeries } from "@/lib/v2/useSparkSeries";
import { useUptime } from "@/lib/v2/useUptime";
import { useZipBrain } from "@/lib/v2/useZipBrain";

function planStateColor(state: string): string {
  switch (state) {
    case "following":
      return "var(--v2-green)";
    case "planning":
      return "var(--v2-amber)";
    case "blocked":
    case "no_path":
      return "var(--v2-rose)";
    case "reached":
      return "var(--v2-cyan-bright)";
    default:
      return "var(--v2-text-dim)";
  }
}

export default function V2Page() {
  const { state, send, reconnect, url } = useZipBrain();
  const { events, log } = useEventLog();
  const fps = useFps();
  const uptime = useUptime();

  // ----- drive input + send loop -----
  const sendStopRef = useRef<() => void>(() => {});
  // useDriveInput dispatches axes changes synchronously inside the keydown
  // event handler. We forward that into the WS as the fastest possible path
  // (one DOM-task hop, no rAF or React-render wait).
  const driveInput = useDriveInput({
    onStop: () => {
      sendStopRef.current();
    },
    onAxesChange: (a) => {
      if (a.v === 0 && a.w === 0) {
        send({ type: "stop" });
      } else {
        send({
          type: "drive",
          v: Math.round(a.v * 150),
          w: Math.round(a.w * 130),
          ttl_ms: 250,
        });
      }
    },
  });
  const stopOnce = useCallback(() => {
    send({ type: "stop" });
    log("crit", "ESTOP issued");
  }, [send, log]);
  sendStopRef.current = stopOnce;

  // useDriveTick is now belt-and-braces: a 30Hz re-send to keep the UNO's
  // deadman TTL fresh while the operator holds a key. The first packet
  // already left via the synchronous onAxesChange path above.
  useDriveTick(driveInput.axesRef, send);

  // ----- side-channel WS for latency / acks -----
  // We use a small parallel WebSocket whose only job is forwarding messages
  // into the bus. Cheap; the brain accepts multiple clients.
  const bus = useParallelWsBus(url);
  const latency = useLatency(send, bus.register, 1500);

  // ----- perception: detections overlay + captured-object gallery -----
  const httpBase = useMemo(() => brainHttpBase(url), [url]);
  const { frame: detFrame, snapshots, fresh: detFresh } = useDetections(
    bus.register,
    httpBase,
  );

  // ----- Phase 5 sensors: IMU heading + servo-swept radar -----
  const sensors = useSensors(bus.register);
  const mapState = useMap(bus.register);
  const plan = usePlan(bus.register);
  const onPickGoal = useCallback(
    (x: number, y: number) => {
      send({ type: "goto", x, y });
      log("cmd", `GOTO x ${x.toFixed(2)} y ${y.toFixed(2)}`);
    },
    [send, log],
  );
  const cancelGoto = useCallback(() => {
    send({ type: "goto_cancel" });
    log("warn", "GOTO cancelled");
  }, [send, log]);
  const [scanning, setScanning] = useState(false);
  const toggleScan = useCallback(
    (on: boolean) => {
      setScanning(on);
      send({ type: "scan", enabled: on });
    },
    [send],
  );

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

  // ----- perception: report newly captured objects into the event log -----
  const lastSnapIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newest = snapshots[0];
    if (newest && newest.id !== lastSnapIdRef.current) {
      lastSnapIdRef.current = newest.id;
      log("info", `Sighted ${newest.label} (${Math.round(newest.confidence * 100)}%)`);
    }
  }, [snapshots, log]);

  // Memoize axes object identity so child renders are stable
  const axes = useMemo(
    () => ({ v: driveInput.axes.v, w: driveInput.axes.w }),
    [driveInput.axes.v, driveInput.axes.w],
  );

  // ----- camera registry (poll /cam/list once on connect; re-poll every 5s)
  const { sources: cameraSources } = useCameraSources(url, 5000);
  const bowSource = cameraSources.find((s) => s.name === "bow");
  const aftSource = cameraSources.find((s) => s.name === "aft");

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
          wheelsLocked={sensors.wheelsLocked}
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
              callsign="VIEW // MAP"
              topRight={
                <>
                  <span style={{ color: planStateColor(plan.state) }}>{plan.state.toUpperCase()}</span>
                  {plan.goal && (
                    <button
                      type="button"
                      onClick={cancelGoto}
                      className="zip-label text-[9px] text-[var(--v2-rose)] border border-[var(--v2-panel-edge)] hover:border-[var(--v2-rose)] px-1.5 rounded-sm pointer-events-auto"
                    >
                      ✕ CANCEL
                    </button>
                  )}
                  <span className="zip-num text-[var(--v2-text)]">{mapState.occupied.length} cells</span>
                </>
              }
              bottomLeft={
                <>
                  <span>POSE · DEAD-RECKON</span>
                  <span className="zip-num text-[var(--v2-text)]">
                    {mapState.pose
                      ? `x ${mapState.pose.x.toFixed(2)} y ${mapState.pose.y.toFixed(2)} yaw ${((mapState.pose.theta * 180) / Math.PI).toFixed(0)}°`
                      : "x — y — yaw —"}
                  </span>
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
              <MapView map={mapState} path={plan.path} goal={plan.goal} onPick={onPickGoal} />
            </ViewportFrame>
          </div>
          {/* Compact camera strip BELOW the hero — fixed height regardless of column width.
              Phase 3.2 wires the BOW camera (Logitech C615) here; AFT (ESP32 OV2640)
              will fill the right slot once Phase 3.3 lands. */}
          <div className="h-44 shrink-0 grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <CameraFeed
                callsign="CAM // BOW"
                label={
                  bowSource
                    ? `${bowSource.width}×${bowSource.height} · ${detFrame.detections.length} OBJ${
                        detFrame.backend ? ` · ${detFrame.backend}` : ""
                      }`
                    : "—"
                }
                streamUrl={bowSource ? camStreamUrl(url, "bow") : undefined}
                overlay={<DetectionOverlay frame={detFrame} fresh={detFresh} />}
              />
            </div>
            <div className="col-span-1">
              <CameraFeed
                callsign="CAM // AFT"
                label={
                  aftSource ? `${aftSource.width}×${aftSource.height} · ${aftSource.fps}FPS · MJPG` : "PHASE 3.3"
                }
                streamUrl={aftSource ? camStreamUrl(url, "aft") : undefined}
              />
            </div>
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
          <RadarPanel
            scan={sensors.scan}
            yawDeg={sensors.yawDeg}
            scanning={scanning}
            onToggleScan={toggleScan}
          />
          <SnapshotGallery snapshots={snapshots} />
          <AgentRail />
        </div>
      }
      bottom={<EventLog events={events} rawLog={state.rawLog} />}
    />
  );
}
