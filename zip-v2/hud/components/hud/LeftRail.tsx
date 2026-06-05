"use client";

import { LAYOUT, PROJECTOR_LAYOUT } from "@/lib/constants";
import { useProjector } from "@/lib/projector/projector-provider";
import SystemStatsPanel from "./panels/SystemStatsPanel";
import WeatherPanel from "./panels/WeatherPanel";
import CameraPanel from "./panels/CameraPanel";
import PrinterPanel from "./panels/PrinterPanel";
import RobotPanel from "./panels/RobotPanel";

export default function LeftRail() {
  const { isProjectorMode } = useProjector();
  const railWidth = isProjectorMode ? PROJECTOR_LAYOUT.LEFT_RAIL_WIDTH : LAYOUT.LEFT_RAIL_WIDTH;

  return (
    <div
      className={`bg-panel-surface border-r border-border p-3 flex flex-col ${isProjectorMode ? "overflow-y-visible" : "overflow-hidden"}`}
      style={{ width: `${railWidth}px` }}
    >
      <div className="flex flex-col gap-3 flex-shrink-0">
        <SystemStatsPanel />
        <WeatherPanel />
        <CameraPanel />
        <RobotPanel />
      </div>
      <div className="flex-1 min-h-0 mt-3">
        <PrinterPanel />
      </div>
    </div>
  );
}

