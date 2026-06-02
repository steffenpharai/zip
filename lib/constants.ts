export const LAYOUT = {
  LEFT_RAIL_WIDTH: 339,
  RIGHT_RAIL_WIDTH: 416,
  TOP_BAR_HEIGHT: 56,
  CARD_SPACING: 12,
  CARD_RADIUS: 12,
} as const;

export const PROJECTOR_LAYOUT = {
  LEFT_RAIL_WIDTH: 510,
  RIGHT_RAIL_WIDTH: 620,
  TOP_BAR_HEIGHT: 84,
  CARD_SPACING: 12,
  CARD_RADIUS: 12,
} as const;

export const INTERVALS = {
  PANEL_UPDATE_MS: 5000, // Increased from 2000ms to 5000ms to reduce request flooding
  WEATHER_UPDATE_MS: 300000, // 5 minutes - weather doesn't change frequently
  UPTIME_TICK_MS: 1000,
} as const;

export const ZIP_MODES = {
  IDLE: "IDLE",
  WAKE_LISTEN: "WAKE_LISTEN",
  LISTENING: "LISTENING",
  THINKING: "THINKING",
  TOOL_RUNNING: "TOOL_RUNNING",
  SPEAKING: "SPEAKING",
  ERROR: "ERROR",
} as const;

export type ZipMode = (typeof ZIP_MODES)[keyof typeof ZIP_MODES];

