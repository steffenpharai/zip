"use client";

import { useEffect, useState } from "react";

import type { PlanState, PlanStatusMsg, PlanPathMsg, ServerMessage } from "./types";

export interface PlanData {
  path: [number, number][];
  goal: [number, number] | null;
  state: PlanState;
}

const EMPTY: PlanData = { path: [], goal: null, state: "idle" };

/** Subscribe to the Phase 5.2 planner streams (path + status) on the bus. */
export function usePlan(
  registerMessageHook: (fn: (m: ServerMessage) => void) => () => void,
): PlanData {
  const [data, setData] = useState<PlanData>(EMPTY);

  useEffect(() => {
    const unsub = registerMessageHook((m) => {
      if (m.type === "plan_path") {
        const p = m as PlanPathMsg;
        setData((d) => ({ ...d, path: p.points, goal: p.goal }));
      } else if (m.type === "plan_status") {
        setData((d) => ({ ...d, state: (m as PlanStatusMsg).state }));
      }
    });
    return unsub;
  }, [registerMessageHook]);

  return data;
}
