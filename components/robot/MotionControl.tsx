"use client";

/**
 * MotionControl - D-pad style motion control for the robot
 * 
 * Provides directional buttons and velocity sliders for manual robot control.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface MotionControlProps {
  onMove: (v: number, w: number) => void;
  onStop: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export default function MotionControl({
  onMove,
  onStop,
  disabled = false,
  isStreaming = false,
}: MotionControlProps) {
  const [velocity, setVelocity] = useState(100);
  const [turnRate, setTurnRate] = useState(80);
  const [activeDirection, setActiveDirection] = useState<string | null>(null);
  const moveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
      }
    };
  }, []);

  const startMove = useCallback((direction: string) => {
    if (disabled) return;
    
    setActiveDirection(direction);
    
    let v = 0;
    let w = 0;
    
    switch (direction) {
      case "forward":
        v = velocity;
        break;
      case "backward":
        v = -velocity;
        break;
      case "left":
        w = -turnRate;
        break;
      case "right":
        w = turnRate;
        break;
      case "forward-left":
        v = velocity;
        w = -turnRate / 2;
        break;
      case "forward-right":
        v = velocity;
        w = turnRate / 2;
        break;
      case "backward-left":
        v = -velocity;
        w = -turnRate / 2;
        break;
      case "backward-right":
        v = -velocity;
        w = turnRate / 2;
        break;
    }
    
    onMove(v, w);
    
    // For streaming mode, we don't need to repeat
    if (!isStreaming) {
      // Clear any existing interval
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
      }
      
      // Start repeating the move command
      moveIntervalRef.current = setInterval(() => {
        onMove(v, w);
      }, 100);
    }
  }, [disabled, velocity, turnRate, onMove, isStreaming]);

  const stopMove = useCallback(() => {
    setActiveDirection(null);
    
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
    
    onStop();
  }, [onStop]);

  const buttonClass = (direction: string) => `
    w-12 h-12 rounded-lg border transition-all duration-100 flex items-center justify-center
    ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent-cyan/20"}
    ${activeDirection === direction 
      ? "bg-accent-cyan/30 border-accent-cyan text-accent-cyan" 
      : "bg-panel-surface border-border text-text-primary hover:border-accent-cyan/50"
    }
  `;

  return (
    <div className="space-y-4">
      {/* D-Pad */}
      <div className="flex flex-col items-center gap-1">
        {/* Top row */}
        <div className="flex gap-1">
          <button
            className={buttonClass("forward-left")}
            onMouseDown={() => startMove("forward-left")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("forward-left")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          <button
            className={buttonClass("forward")}
            onMouseDown={() => startMove("forward")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("forward")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          <button
            className={buttonClass("forward-right")}
            onMouseDown={() => startMove("forward-right")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("forward-right")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        {/* Middle row */}
        <div className="flex gap-1">
          <button
            className={buttonClass("left")}
            onMouseDown={() => startMove("left")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("left")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          <button
            className={`${buttonClass("stop")} bg-red-500/20 border-red-500/50 hover:bg-red-500/30`}
            onClick={onStop}
            disabled={disabled}
          >
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
          <button
            className={buttonClass("right")}
            onMouseDown={() => startMove("right")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("right")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>

        {/* Bottom row */}
        <div className="flex gap-1">
          <button
            className={buttonClass("backward-left")}
            onMouseDown={() => startMove("backward-left")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("backward-left")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 rotate-[225deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          <button
            className={buttonClass("backward")}
            onMouseDown={() => startMove("backward")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("backward")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
          <button
            className={buttonClass("backward-right")}
            onMouseDown={() => startMove("backward-right")}
            onMouseUp={stopMove}
            onMouseLeave={stopMove}
            onTouchStart={() => startMove("backward-right")}
            onTouchEnd={stopMove}
            disabled={disabled}
          >
            <svg className="w-5 h-5 rotate-[135deg]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Velocity Sliders */}
      <div className="space-y-3 pt-3 border-t border-border/50">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-muted">Speed</span>
            <span className="text-text-primary font-mono">{velocity}</span>
          </div>
          <input
            type="range"
            min="40"
            max="255"
            value={velocity}
            onChange={(e) => setVelocity(parseInt(e.target.value, 10))}
            disabled={disabled}
            className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-muted">Turn Rate</span>
            <span className="text-text-primary font-mono">{turnRate}</span>
          </div>
          <input
            type="range"
            min="40"
            max="255"
            value={turnRate}
            onChange={(e) => setTurnRate(parseInt(e.target.value, 10))}
            disabled={disabled}
            className="w-full h-2 bg-panel-surface rounded-lg appearance-none cursor-pointer accent-accent-cyan"
          />
        </div>
      </div>
    </div>
  );
}

