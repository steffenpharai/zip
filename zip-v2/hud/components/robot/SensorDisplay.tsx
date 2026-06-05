"use client";

/**
 * SensorDisplay - Visualization of robot sensor readings
 * 
 * Shows ultrasonic distance, line sensors, and battery status.
 */

import type { RobotSensors } from "@/lib/robot/types";

interface SensorDisplayProps {
  sensors: RobotSensors;
  loading?: boolean;
}

export default function SensorDisplay({
  sensors,
  loading = false,
}: SensorDisplayProps) {
  const { ultrasonic, lineSensor, battery } = sensors;

  function getBatteryColor(percent: number): string {
    if (percent >= 60) return "bg-online-green";
    if (percent >= 30) return "bg-yellow-500";
    return "bg-red-500";
  }

  function getBatteryTextColor(percent: number): string {
    if (percent >= 60) return "text-online-green";
    if (percent >= 30) return "text-yellow-500";
    return "text-red-500";
  }

  function getDistanceColor(distance: number | null): string {
    if (distance === null) return "text-text-muted";
    if (distance <= 10) return "text-red-500";
    if (distance <= 30) return "text-yellow-500";
    return "text-online-green";
  }

  // Line sensor threshold - values above this indicate line detection
  const LINE_THRESHOLD = 500;

  return (
    <div className="space-y-4">
      {/* Ultrasonic Sensor */}
      <div className="bg-panel-surface border border-border rounded-lg p-3">
        <h5 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
          Ultrasonic
        </h5>
        {loading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : ultrasonic ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-mono ${getDistanceColor(ultrasonic.distance)}`}>
                {ultrasonic.distance !== null ? ultrasonic.distance : "--"}
              </span>
              <span className="text-text-muted text-sm">cm</span>
            </div>
            {ultrasonic.obstacle && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Obstacle detected!
              </div>
            )}
            {/* Distance visualization bar */}
            <div className="h-2 bg-panel-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  ultrasonic.distance !== null
                    ? ultrasonic.distance <= 10 ? "bg-red-500" :
                      ultrasonic.distance <= 30 ? "bg-yellow-500" : "bg-online-green"
                    : "bg-text-muted"
                }`}
                style={{
                  width: `${Math.min(100, Math.max(5, ((ultrasonic.distance ?? 0) / 400) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="text-text-muted text-sm">No data</div>
        )}
      </div>

      {/* Line Sensors */}
      <div className="bg-panel-surface border border-border rounded-lg p-3">
        <h5 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
          Line Sensors
        </h5>
        {loading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : lineSensor ? (
          <div className="space-y-3">
            {/* Visual representation */}
            <div className="flex justify-center gap-4">
              {[
                { label: "L", value: lineSensor.left },
                { label: "M", value: lineSensor.middle },
                { label: "R", value: lineSensor.right },
              ].map((sensor) => (
                <div key={sensor.label} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full border-2 transition-colors ${
                      sensor.value > LINE_THRESHOLD
                        ? "bg-accent-cyan border-accent-cyan"
                        : "bg-panel-surface-2 border-border"
                    }`}
                  />
                  <span className="text-xs text-text-muted">{sensor.label}</span>
                  <span className="text-xs font-mono text-text-primary">
                    {sensor.value}
                  </span>
                </div>
              ))}
            </div>
            {/* Raw values */}
            <div className="text-xs text-text-muted text-center">
              Threshold: {LINE_THRESHOLD} (above = line detected)
            </div>
          </div>
        ) : (
          <div className="text-text-muted text-sm">No data</div>
        )}
      </div>

      {/* Battery */}
      <div className="bg-panel-surface border border-border rounded-lg p-3">
        <h5 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
          Battery
        </h5>
        {loading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : battery ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-mono ${getBatteryTextColor(battery.percent)}`}>
                  {battery.percent.toFixed(0)}%
                </span>
              </div>
              <span className="text-text-muted text-sm font-mono">
                {(battery.voltage / 1000).toFixed(2)}V
              </span>
            </div>
            {/* Battery bar */}
            <div className="relative h-6 bg-panel-surface-2 rounded border border-border overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getBatteryColor(battery.percent)}`}
                style={{ width: `${battery.percent}%` }}
              />
              {/* Battery cap */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-0.5 w-1 h-3 bg-border rounded-r" />
            </div>
            {/* Status text */}
            <div className="text-xs text-text-muted">
              {battery.percent >= 80 ? "Fully charged" :
               battery.percent >= 40 ? "Good" :
               battery.percent >= 20 ? "Low - consider charging" :
               "Critical - charge immediately"}
            </div>
          </div>
        ) : (
          <div className="text-text-muted text-sm">No data</div>
        )}
      </div>
    </div>
  );
}

