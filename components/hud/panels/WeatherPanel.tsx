"use client";

import { useState } from "react";
import { useEventBus } from "@/lib/events/hooks";
import { useProjector } from "@/lib/projector/projector-provider";
import type { ZipEvent } from "@/lib/events/types";
import { LAYOUT } from "@/lib/constants";
import { format, parseISO } from "date-fns";

interface Weather {
  tempF: number;
  city: string;
  country: string;
  condition: string;
  humidityPercent: number;
  windMs: number;
  feelsLikeF: number;
  pressure?: number;
  uvIndex?: number;
  cloudCover?: number;
  visibility?: number;
  hourlyForecast?: Array<{
    time: string;
    tempF: number;
    condition: string;
    humidityPercent: number;
    windMs: number;
    precipitationProbability: number;
  }>;
  dailyForecast?: Array<{
    date: string;
    tempMaxF: number;
    tempMinF: number;
    condition: string;
    precipitationSum: number;
    windMaxMs: number;
  }>;
  airQuality?: {
    usAqi: number;
    pm10: number;
    pm25: number;
    ozone: number;
  };
  elevation?: number;
  timezone?: string;
  solarRadiation?: {
    shortwave: number;
    direct: number;
    diffuse: number;
  };
}

type Tab = "current" | "hourly" | "daily" | "details";

function getAqiLabel(aqi: number): { label: string; color: string } {
  if (aqi <= 50) return { label: "Good", color: "text-green-500" };
  if (aqi <= 100) return { label: "Moderate", color: "text-yellow-500" };
  if (aqi <= 150) return { label: "Unhealthy for Sensitive", color: "text-orange-500" };
  if (aqi <= 200) return { label: "Unhealthy", color: "text-red-500" };
  if (aqi <= 300) return { label: "Very Unhealthy", color: "text-purple-500" };
  return { label: "Hazardous", color: "text-red-700" };
}

export default function WeatherPanel() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("current");
  const { isProjectorMode } = useProjector();

  useEventBus((event: ZipEvent) => {
    if (event.type === "panel.update" && event.panel === "weather") {
      setWeather(event.payload as Weather);
      setError(null); // Clear error on successful update
    } else if (event.type === "panel.update" && event.panel === "weather_error") {
      const errorPayload = event.payload as { message?: string } | undefined;
      setError(errorPayload?.message || "Failed to load weather data");
      setWeather(null);
    }
  });

  if (error) {
    return (
      <div
        className="bg-panel-surface-2 border border-border rounded-xl p-4"
        style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
      >
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
          Weather
        </h4>
        <div className="text-text-muted text-sm space-y-1">
          <div className="text-red-400">{error}</div>
          <div className="text-xs text-text-muted/70">
            {error.includes("location") || error.includes("geolocation")
              ? "Please enable location permissions in your browser settings."
              : "Weather data is temporarily unavailable."}
          </div>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div
        className="bg-panel-surface-2 border border-border rounded-xl p-4"
        style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
      >
        <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
          Weather
        </h4>
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div
      className="bg-panel-surface-2 border border-border rounded-xl p-4"
      style={{ borderRadius: `${LAYOUT.CARD_RADIUS}px` }}
    >
      <h4 className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
        Weather
      </h4>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        <button
          onClick={() => setActiveTab("current")}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === "current"
              ? "text-text-primary border-b-2 border-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Current
        </button>
        {weather.hourlyForecast && weather.hourlyForecast.length > 0 && (
          <button
            onClick={() => setActiveTab("hourly")}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              activeTab === "hourly"
                ? "text-text-primary border-b-2 border-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Hourly
          </button>
        )}
        {weather.dailyForecast && weather.dailyForecast.length > 0 && (
          <button
            onClick={() => setActiveTab("daily")}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              activeTab === "daily"
                ? "text-text-primary border-b-2 border-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Daily
          </button>
        )}
        <button
          onClick={() => setActiveTab("details")}
          className={`px-2 py-1 text-xs font-medium transition-colors ${
            activeTab === "details"
              ? "text-text-primary border-b-2 border-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          Details
        </button>
      </div>

      {/* Current Tab */}
      {activeTab === "current" && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-text-primary text-3xl font-semibold">
              {Math.round(weather.tempF)}°
            </span>
            <span className="text-text-muted text-sm">F</span>
          </div>
          <div className="text-text-primary text-sm">{weather.condition}</div>
          <div className="text-text-muted text-xs">
            {weather.city}, {weather.country}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="text-text-muted">
              <span className="font-medium">Humidity:</span> {weather.humidityPercent}%
            </div>
            <div className="text-text-muted">
              <span className="font-medium">Wind:</span> {weather.windMs.toFixed(1)} m/s
            </div>
            {weather.feelsLikeF && (
              <div className="text-text-muted">
                <span className="font-medium">Feels Like:</span> {Math.round(weather.feelsLikeF)}°F
              </div>
            )}
            {weather.pressure && (
              <div className="text-text-muted">
                <span className="font-medium">Pressure:</span> {weather.pressure} hPa
              </div>
            )}
            {weather.uvIndex !== undefined && (
              <div className="text-text-muted">
                <span className="font-medium">UV Index:</span> {weather.uvIndex}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hourly Forecast Tab */}
      {activeTab === "hourly" && weather.hourlyForecast && (
        <div className={`space-y-2 ${isProjectorMode ? "" : "max-h-64 overflow-y-auto"}`}>
          {weather.hourlyForecast.map((hour, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <div className="flex-1">
                <div className="text-text-primary text-sm font-medium">
                  {format(parseISO(hour.time), "h:mm a")}
                </div>
                <div className="text-text-muted text-xs">{hour.condition}</div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-text-primary font-medium">
                  {Math.round(hour.tempF)}°F
                </div>
                <div className="text-text-muted">
                  {hour.precipitationProbability > 0 && (
                    <span>💧 {hour.precipitationProbability}%</span>
                  )}
                </div>
                <div className="text-text-muted">
                  {hour.windMs.toFixed(1)} m/s
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily Forecast Tab */}
      {activeTab === "daily" && weather.dailyForecast && (
        <div className={`space-y-2 ${isProjectorMode ? "" : "max-h-64 overflow-y-auto"}`}>
          {weather.dailyForecast.map((day, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <div className="flex-1">
                <div className="text-text-primary text-sm font-medium">
                  {index === 0 ? "Today" : format(parseISO(day.date), "EEE, MMM d")}
                </div>
                <div className="text-text-muted text-xs">{day.condition}</div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-text-primary font-medium">
                  {Math.round(day.tempMaxF)}°/{Math.round(day.tempMinF)}°
                </div>
                {day.precipitationSum > 0 && (
                  <div className="text-text-muted">
                    💧 {day.precipitationSum.toFixed(2)} mm
                  </div>
                )}
                <div className="text-text-muted">
                  {day.windMaxMs.toFixed(1)} m/s
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Details Tab */}
      {activeTab === "details" && (
        <div className="space-y-3 text-xs">
          {/* Air Quality */}
          {weather.airQuality && (
            <div className="border-b border-border/50 pb-3">
              <div className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
                Air Quality
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-muted">US AQI:</span>
                  <span className={`font-medium ${getAqiLabel(weather.airQuality.usAqi).color}`}>
                    {weather.airQuality.usAqi} ({getAqiLabel(weather.airQuality.usAqi).label})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">PM2.5:</span>
                  <span className="text-text-primary">{weather.airQuality.pm25} µg/m³</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">PM10:</span>
                  <span className="text-text-primary">{weather.airQuality.pm10} µg/m³</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Ozone:</span>
                  <span className="text-text-primary">{weather.airQuality.ozone} µg/m³</span>
                </div>
              </div>
            </div>
          )}

          {/* Location Info */}
          <div className="border-b border-border/50 pb-3">
            <div className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
              Location
            </div>
            <div className="space-y-1">
              {weather.elevation !== undefined && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Elevation:</span>
                  <span className="text-text-primary">{weather.elevation} m</span>
                </div>
              )}
              {weather.timezone && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Timezone:</span>
                  <span className="text-text-primary">{weather.timezone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Additional Weather Data */}
          <div className="space-y-1">
            <div className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-2">
              Additional Data
            </div>
            {weather.cloudCover !== undefined && (
              <div className="flex justify-between">
                <span className="text-text-muted">Cloud Cover:</span>
                <span className="text-text-primary">{weather.cloudCover}%</span>
              </div>
            )}
            {weather.visibility !== undefined && (
              <div className="flex justify-between">
                <span className="text-text-muted">Visibility:</span>
                <span className="text-text-primary">{weather.visibility} km</span>
              </div>
            )}
            {weather.solarRadiation && (
              <>
                <div className="flex justify-between">
                  <span className="text-text-muted">Solar (Shortwave):</span>
                  <span className="text-text-primary">{weather.solarRadiation.shortwave} W/m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Direct Radiation:</span>
                  <span className="text-text-primary">{weather.solarRadiation.direct} W/m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Diffuse Radiation:</span>
                  <span className="text-text-primary">{weather.solarRadiation.diffuse} W/m²</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
