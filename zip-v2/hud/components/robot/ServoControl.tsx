"use client";

/**
 * ServoControl - Camera Gimbal Pan Control
 * 
 * Controls the pan servo (N=5 command) for camera positioning.
 * Provides slider and preset buttons for common positions.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface ServoControlProps {
  onSetAngle: (angle: number) => Promise<void>;
  disabled?: boolean;
  initialAngle?: number;
}

// Preset positions for quick access
const PRESETS = [
  { label: "L", angle: 30, title: "Left (30°)" },
  { label: "C", angle: 90, title: "Center (90°)" },
  { label: "R", angle: 150, title: "Right (150°)" },
] as const;

export default function ServoControl({
  onSetAngle,
  disabled = false,
  initialAngle = 90,
}: ServoControlProps) {
  const [angle, setAngle] = useState(initialAngle);
  const [isMoving, setIsMoving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentAngleRef = useRef(initialAngle);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Send servo command with debouncing
  const sendAngle = useCallback(async (newAngle: number) => {
    // Skip if same as last sent angle
    if (newAngle === lastSentAngleRef.current) return;
    
    setIsMoving(true);
    try {
      await onSetAngle(newAngle);
      lastSentAngleRef.current = newAngle;
    } catch (error) {
      console.error("[ServoControl] Failed to set angle:", error);
    } finally {
      setIsMoving(false);
    }
  }, [onSetAngle]);

  // Handle slider change with debounce
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newAngle = parseInt(e.target.value, 10);
    setAngle(newAngle);
    
    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce the actual command (300ms)
    debounceRef.current = setTimeout(() => {
      sendAngle(newAngle);
    }, 300);
  }, [sendAngle]);

  // Handle slider release - send immediately
  const handleSliderRelease = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    sendAngle(angle);
  }, [angle, sendAngle]);

  // Handle preset button click
  const handlePreset = useCallback((presetAngle: number) => {
    setAngle(presetAngle);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    sendAngle(presetAngle);
  }, [sendAngle]);

  return (
    <div className="bg-panel-surface border border-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Camera Pan
        </h4>
        <div className="flex items-center gap-2">
          {isMoving && (
            <svg className="w-3 h-3 animate-spin text-accent-cyan" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <span className="text-text-primary font-mono text-sm">
            {angle}°
          </span>
        </div>
      </div>

      {/* Angle Slider */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type="range"
            min="0"
            max="180"
            value={angle}
            onChange={handleSliderChange}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            disabled={disabled}
            className="w-full h-2 bg-panel-surface-2 rounded-lg appearance-none cursor-pointer accent-accent-cyan disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {/* Scale markers */}
          <div className="flex justify-between text-[10px] text-text-muted mt-1 px-0.5">
            <span>0°</span>
            <span>90°</span>
            <span>180°</span>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.angle}
              onClick={() => handlePreset(preset.angle)}
              disabled={disabled}
              title={preset.title}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                angle === preset.angle
                  ? "bg-accent-cyan/20 border-accent-cyan text-accent-cyan"
                  : "bg-panel-surface-2 border-border text-text-primary hover:border-accent-cyan/50 hover:text-accent-cyan"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Visual indicator */}
        <div className="relative h-8 bg-panel-surface-2 rounded-lg overflow-hidden">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
          
          {/* Servo position indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-accent-cyan shadow-lg shadow-accent-cyan/30 transition-all duration-300"
            style={{
              left: `calc(${(angle / 180) * 100}% - 8px)`,
            }}
          />
          
          {/* Direction labels */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] text-text-muted pointer-events-none">
            <span>← Left</span>
            <span>Right →</span>
          </div>
        </div>
      </div>
    </div>
  );
}

