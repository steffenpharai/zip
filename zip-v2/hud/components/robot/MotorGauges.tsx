"use client";

/**
 * MotorGauges - Visual display of motor PWM values
 * 
 * Shows left and right motor power with direction indicators.
 */

import type { RobotDiagnostics } from "@/lib/robot/types";

interface MotorGaugesProps {
  diagnostics: RobotDiagnostics | null;
  loading?: boolean;
}

export default function MotorGauges({
  diagnostics,
  loading = false,
}: MotorGaugesProps) {
  function getOwnerLabel(owner: string): string {
    switch (owner) {
      case "I":
        return "Idle";
      case "D":
        return "Direct";
      case "X":
        return "Stopped";
      default:
        return owner;
    }
  }

  function getOwnerColor(owner: string): string {
    switch (owner) {
      case "I":
        return "text-text-muted";
      case "D":
        return "text-accent-cyan";
      case "X":
        return "text-red-500";
      default:
        return "text-text-primary";
    }
  }

  function getPWMBarWidth(pwm: number): number {
    return Math.min(100, (Math.abs(pwm) / 255) * 100);
  }

  function getPWMColor(pwm: number): string {
    if (pwm === 0) return "bg-text-muted";
    if (pwm > 0) return "bg-online-green";
    return "bg-red-500";
  }

  function formatPWM(pwm: number): string {
    const sign = pwm >= 0 ? "+" : "";
    return `${sign}${pwm}`;
  }

  const motorLeft = diagnostics?.motorLeft ?? 0;
  const motorRight = diagnostics?.motorRight ?? 0;

  return (
    <div className="bg-panel-surface border border-border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Motor Status
        </h4>
        {diagnostics && (
          <span className={`text-xs font-medium ${getOwnerColor(diagnostics.owner)}`}>
            {getOwnerLabel(diagnostics.owner)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-text-muted text-sm text-center py-4">Loading...</div>
      ) : !diagnostics ? (
        <div className="text-text-muted text-sm text-center py-4">No data</div>
      ) : (
        <>
          {/* Motor Gauges */}
          <div className="space-y-4">
            {/* Left Motor */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-text-muted text-sm">Left Motor</span>
                <span className={`font-mono text-lg ${motorLeft !== 0 ? "text-text-primary" : "text-text-muted"}`}>
                  {formatPWM(motorLeft)}
                </span>
              </div>
              <div className="relative h-6 bg-panel-surface-2 rounded overflow-hidden">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                {/* PWM bar */}
                <div
                  className={`absolute top-0 bottom-0 h-full transition-all duration-100 ${getPWMColor(motorLeft)}`}
                  style={{
                    width: `${getPWMBarWidth(motorLeft) / 2}%`,
                    left: motorLeft >= 0 ? "50%" : `${50 - getPWMBarWidth(motorLeft) / 2}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>-255</span>
                <span>0</span>
                <span>+255</span>
              </div>
            </div>

            {/* Right Motor */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-text-muted text-sm">Right Motor</span>
                <span className={`font-mono text-lg ${motorRight !== 0 ? "text-text-primary" : "text-text-muted"}`}>
                  {formatPWM(motorRight)}
                </span>
              </div>
              <div className="relative h-6 bg-panel-surface-2 rounded overflow-hidden">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                {/* PWM bar */}
                <div
                  className={`absolute top-0 bottom-0 h-full transition-all duration-100 ${getPWMColor(motorRight)}`}
                  style={{
                    width: `${getPWMBarWidth(motorRight) / 2}%`,
                    left: motorRight >= 0 ? "50%" : `${50 - getPWMBarWidth(motorRight) / 2}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>-255</span>
                <span>0</span>
                <span>+255</span>
              </div>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
            <div>
              <div className="text-text-muted text-xs uppercase tracking-wide">Standby</div>
              <div className={`font-mono text-sm ${diagnostics.standby ? "text-yellow-500" : "text-online-green"}`}>
                {diagnostics.standby ? "ON" : "OFF"}
              </div>
            </div>
            <div>
              <div className="text-text-muted text-xs uppercase tracking-wide">State</div>
              <div className="text-text-primary font-mono text-sm">
                {diagnostics.state}
              </div>
            </div>
            <div>
              <div className="text-text-muted text-xs uppercase tracking-wide">Resets</div>
              <div className="text-text-primary font-mono text-sm">
                {diagnostics.resets}
              </div>
            </div>
          </div>

          {/* Serial Stats */}
          {diagnostics.stats && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">RX Bytes:</span>
                <span className="text-text-primary font-mono">{diagnostics.stats.rxBytes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">TX Bytes:</span>
                <span className="text-text-primary font-mono">{diagnostics.stats.txBytes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">JSON Errors:</span>
                <span className={`font-mono ${diagnostics.stats.jsonDecodeErrors > 0 ? "text-red-500" : "text-text-primary"}`}>
                  {diagnostics.stats.jsonDecodeErrors}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Parse Errors:</span>
                <span className={`font-mono ${diagnostics.stats.parseErrors > 0 ? "text-red-500" : "text-text-primary"}`}>
                  {diagnostics.stats.parseErrors}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

