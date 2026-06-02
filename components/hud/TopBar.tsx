"use client";

import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { useProjector } from "@/lib/projector/projector-provider";
import { LAYOUT, PROJECTOR_LAYOUT } from "@/lib/constants";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import SettingsDropdown from "./SettingsDropdown";

interface Weather {
  tempF: number;
  city: string;
  country: string;
}

function WeatherChip() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const { isProjectorMode } = useProjector();

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "weather") {
      const weatherData = event.payload as Weather;
      setWeather(weatherData);
    }
  });

  if (!weather) {
    return (
      <div className="px-3 py-1.5 rounded-md bg-panel-surface border border-border">
        <span className={`text-text-primary ${isProjectorMode ? "text-base" : "text-sm"}`}>Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5 rounded-md bg-panel-surface border border-border">
      <span className={`text-text-primary ${isProjectorMode ? "text-base" : "text-sm"}`}>
        {Math.round(weather.tempF)}°F • {weather.city}
      </span>
    </div>
  );
}

export default function TopBar() {
  const [time, setTime] = useState<Date | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const { isProjectorMode } = useProjector();

  useEffect(() => {
    // Only set time on client side to avoid hydration mismatch
    setTime(new Date());
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const topBarHeight = isProjectorMode ? PROJECTOR_LAYOUT.TOP_BAR_HEIGHT : LAYOUT.TOP_BAR_HEIGHT;

  return (
    <div
      className="w-full flex items-center justify-between px-4 border-b border-border"
      style={{ height: `${topBarHeight}px` }}
    >
      {/* Left: ZIP title */}
      <div className="flex items-center gap-3">
        <h1 className={`text-text-primary font-semibold tracking-zip uppercase ${isProjectorMode ? "text-xl" : "text-lg"}`}>
          ZIP
        </h1>
      </div>

      {/* Center: Time/Date chip */}
      <div className="px-3 py-1.5 rounded-md bg-panel-surface border border-border">
        <span className={`text-text-primary ${isProjectorMode ? "text-base" : "text-sm"}`} suppressHydrationWarning>
          {time ? (
            <>
              {format(time, "HH:mm:ss")} • {format(time, "MMM d, yyyy")}
            </>
          ) : (
            <span>--:--:-- • -- --, ----</span>
          )}
        </span>
      </div>

      {/* Right: Temp/Location chip + Gear icon */}
      <div className="flex items-center gap-3 relative">
        <WeatherChip />
        <button
          ref={settingsButtonRef}
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="w-8 h-8 flex items-center justify-center rounded-md bg-panel-surface border border-border hover:bg-panel-surface-2 transition-colors"
          aria-label="Settings"
          aria-expanded={isSettingsOpen}
          aria-haspopup="true"
        >
          <svg
            className="w-4 h-4 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
        <SettingsDropdown
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          buttonRef={settingsButtonRef}
        />
      </div>
    </div>
  );
}

