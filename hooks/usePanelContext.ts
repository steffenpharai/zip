"use client";

import { useState, useEffect } from "react";
import { useEventBus } from "@/lib/events/hooks";
import type { ZipEvent } from "@/lib/events/types";
import type { UserContext, WeatherData, SystemStats, UptimeData, UserLocation } from "@/lib/context/types";
import { useHudStore } from "@/lib/state/hudStore";

/**
 * Hook to collect current panel data and location for AI context
 * This provides a way to access collected data that can be sent to the AI
 */
export function usePanelContext(): UserContext {
  const [weather, setWeather] = useState<WeatherData | undefined>(undefined);
  const [systemStats, setSystemStats] = useState<SystemStats | undefined>(undefined);
  const [uptime, setUptime] = useState<UptimeData | undefined>(undefined);
  const [location, setLocation] = useState<UserLocation | undefined>(undefined);
  const { state } = useHudStore();

  // Listen to panel updates
  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update") {
      switch (event.panel) {
        case "weather":
          setWeather(event.payload as WeatherData);
          break;
        case "system":
          setSystemStats(event.payload as SystemStats);
          break;
        case "uptime":
          setUptime(event.payload as UptimeData);
          break;
      }
    }
  });

  // Get location from geolocation API
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        () => {
          // Silently fail - location is optional
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000, // 5 minutes cache
        }
      );
    }
  }, []);

  return {
    location,
    weather,
    systemStats,
    uptime,
    cameraEnabled: state.cameraEnabled,
  };
}

