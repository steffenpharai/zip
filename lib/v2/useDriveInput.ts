"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DriveAxes = {
  /** -1..1, forward positive */
  v: number;
  /** -1..1, right positive (yaw rate sign) */
  w: number;
};

const ZERO: DriveAxes = { v: 0, w: 0 };

const KEY_MAP: Record<string, "up" | "down" | "left" | "right" | "stop"> = {
  w: "up",
  W: "up",
  ArrowUp: "up",
  s: "down",
  S: "down",
  ArrowDown: "down",
  a: "left",
  A: "left",
  ArrowLeft: "left",
  d: "right",
  D: "right",
  ArrowRight: "right",
  " ": "stop",
  Space: "stop",
};

type KeyState = { up: boolean; down: boolean; left: boolean; right: boolean };

/**
 * Merges keyboard and (optional) pointer-driven joystick input into a single
 * unit-normalized axes object. Joystick takes precedence when non-zero.
 *
 * Critically, `onAxesChange` is invoked SYNCHRONOUSLY from the keydown/keyup
 * event handler the moment the axes change. The consumer (useDriveTick) uses
 * this to fire a WS setpoint inside the same browser task as the key press,
 * with no React-render or rAF frame wait. This is the dominant remaining
 * latency optimisation on the HUD side.
 */
export function useDriveInput(opts: {
  onStop: () => void;
  onAxesChange?: (axes: DriveAxes) => void;
}) {
  const [keys, setKeys] = useState<KeyState>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const [joystick, setJoystickState] = useState<DriveAxes>(ZERO);
  const [axes, setAxes] = useState<DriveAxes>(ZERO);

  // Mirror state into refs so the synchronous key handler can read/write the
  // *current* values without waiting for React to flush a render.
  const keysRef = useRef<KeyState>({ up: false, down: false, left: false, right: false });
  const joystickRef = useRef<DriveAxes>(ZERO);
  const axesRef = useRef<DriveAxes>(ZERO);
  const onStopRef = useRef(opts.onStop);
  onStopRef.current = opts.onStop;
  const onAxesChangeRef = useRef(opts.onAxesChange);
  onAxesChangeRef.current = opts.onAxesChange;

  const clearAll = useCallback(() => {
    keysRef.current = { up: false, down: false, left: false, right: false };
    joystickRef.current = ZERO;
    setKeys(keysRef.current);
    setJoystickState(ZERO);
    if (axesRef.current.v !== 0 || axesRef.current.w !== 0) {
      axesRef.current = ZERO;
      setAxes(ZERO);
      onAxesChangeRef.current?.(ZERO);
    }
  }, []);

  useEffect(() => {
    const apply = (k: string, down: boolean) => {
      const slot = KEY_MAP[k];
      if (!slot) return false;
      if (slot === "stop") {
        if (down) {
          clearAll();
          onStopRef.current();
        }
        return true;
      }
      // Compute next key state synchronously.
      if (keysRef.current[slot] === down) return true; // no change
      const nextKeys: KeyState = { ...keysRef.current, [slot]: down };
      keysRef.current = nextKeys;
      setKeys(nextKeys);
      // Recompute axes synchronously and dispatch if changed.
      const nextAxes = composeAxes(nextKeys, joystickRef.current);
      if (
        nextAxes.v !== axesRef.current.v ||
        nextAxes.w !== axesRef.current.w
      ) {
        axesRef.current = nextAxes;
        setAxes(nextAxes);
        onAxesChangeRef.current?.(nextAxes);
      }
      return true;
    };
    const onKD = (e: KeyboardEvent) => {
      if (apply(e.key, true)) e.preventDefault();
    };
    const onKU = (e: KeyboardEvent) => {
      if (apply(e.key, false)) e.preventDefault();
    };
    const onBlur = () => {
      clearAll();
      onStopRef.current();
    };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
      window.removeEventListener("blur", onBlur);
    };
  }, [clearAll]);

  // Joystick path: keep ref + state in sync, dispatch synchronously on change.
  const setJoystick = useCallback((a: DriveAxes) => {
    const clamped: DriveAxes = { v: clamp(a.v), w: clamp(a.w) };
    joystickRef.current = clamped;
    setJoystickState(clamped);
    const nextAxes = composeAxes(keysRef.current, clamped);
    if (
      nextAxes.v !== axesRef.current.v ||
      nextAxes.w !== axesRef.current.w
    ) {
      axesRef.current = nextAxes;
      setAxes(nextAxes);
      onAxesChangeRef.current?.(nextAxes);
    }
  }, []);

  return { axes, axesRef, keys, joystick, setJoystick, clearAll };
}

function composeAxes(keys: KeyState, joystick: DriveAxes): DriveAxes {
  const jActive = joystick.v !== 0 || joystick.w !== 0;
  if (jActive) return joystick;
  const v = (keys.up ? 1 : 0) + (keys.down ? -1 : 0);
  const w = (keys.right ? 1 : 0) + (keys.left ? -1 : 0);
  return { v: clamp(v), w: clamp(w) };
}

function clamp(n: number): number {
  if (n > 1) return 1;
  if (n < -1) return -1;
  return n;
}
