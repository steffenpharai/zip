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

/**
 * Merges keyboard and (optional) pointer-driven joystick input into a single
 * unit-normalized axes object. Joystick takes precedence when non-zero.
 *
 * Returns also the raw key state for the WASD glyph + a `setJoystick` ref-style
 * setter for the on-screen joystick.
 */
export function useDriveInput(opts: { onStop: () => void }) {
  const [keys, setKeys] = useState({ up: false, down: false, left: false, right: false });
  const [joystick, setJoystickState] = useState<DriveAxes>(ZERO);
  const [axes, setAxes] = useState<DriveAxes>(ZERO);

  const onStopRef = useRef(opts.onStop);
  onStopRef.current = opts.onStop;

  const clearAll = useCallback(() => {
    setKeys({ up: false, down: false, left: false, right: false });
    setJoystickState(ZERO);
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
      setKeys((p) => (p[slot] === down ? p : { ...p, [slot]: down }));
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

  // Merge: joystick wins when active, else keys.
  useEffect(() => {
    const jActive = joystick.v !== 0 || joystick.w !== 0;
    if (jActive) {
      setAxes(joystick);
      return;
    }
    const v = (keys.up ? 1 : 0) + (keys.down ? -1 : 0);
    const w = (keys.right ? 1 : 0) + (keys.left ? -1 : 0);
    setAxes({ v: clamp(v), w: clamp(w) });
  }, [keys, joystick]);

  const setJoystick = useCallback((axes: DriveAxes) => {
    setJoystickState({
      v: clamp(axes.v),
      w: clamp(axes.w),
    });
  }, []);

  return { axes, keys, joystick, setJoystick, clearAll };
}

function clamp(n: number): number {
  if (n > 1) return 1;
  if (n < -1) return -1;
  return n;
}
