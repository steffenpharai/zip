/**
 * User context data structure
 * Contains collected data from the frontend that the AI can reference
 */

export interface UserLocation {
  lat: number;
  lon: number;
}

export interface WeatherData {
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

export interface SystemStats {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedGb: number;
  diskTotalGb: number;
  cpuLabel: string;
  memLabel: string;
  diskLabel: string;
}

export interface UptimeData {
  runningSeconds: number;
  sessionCount: number;
  commandsCount: number;
  loadLabel: string;
  loadPercent: number;
  sessionTimeLabel: string;
}

export interface UserContext {
  location?: UserLocation;
  weather?: WeatherData;
  systemStats?: SystemStats;
  uptime?: UptimeData;
  cameraEnabled?: boolean;
}

