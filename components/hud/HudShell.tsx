"use client";

import { LAYOUT, PROJECTOR_LAYOUT } from "@/lib/constants";
import { usePanelUpdates } from "@/hooks/usePanelUpdates";
import { useProjector } from "@/lib/projector/projector-provider";
import TopBar from "./TopBar";
import LeftRail from "./LeftRail";
import CenterCore from "./CenterCore";
import RightChat from "./RightChat";

export default function HudShell() {
  usePanelUpdates();
  const { isProjectorMode } = useProjector();
  const topBarHeight = isProjectorMode ? PROJECTOR_LAYOUT.TOP_BAR_HEIGHT : LAYOUT.TOP_BAR_HEIGHT;

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden" style={{ height: `calc(100vh - ${topBarHeight}px)` }}>
        <LeftRail />
        <div className="flex-1 flex items-center justify-center">
          <CenterCore />
        </div>
        <RightChat />
      </div>
    </div>
  );
}

