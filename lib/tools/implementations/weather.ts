/**
 * Get comprehensive weather information using Open-Meteo API
 * 
 * Location Services:
 * - Uses W3C Geolocation API (browser standard) for user location
 * - Uses Nominatim (OpenStreetMap) for reverse geocoding (coordinates to city/country)
 * 
 * API Usage:
 * - Open-Meteo: Free, open-source weather API (no API key required)
 * - Nominatim: Free, open-source geocoding (requires proper User-Agent per RFC 7231)
 * - Rate limiting: Nominatim requires max 1 request/second per application
 * 
 * Standards Compliance:
 * - W3C Geolocation API Specification
 * - RFC 7231 (HTTP/1.1) for User-Agent header
 * - Open-Meteo API documentation
 * - Nominatim Usage Policy compliance
 * 
 * Caching:
 * - Weather data: 5 minutes TTL
 * - Geocoding data: 1 hour TTL (location doesn't change frequently)
 * 
 * Error Handling:
 * - All errors are properly typed and thrown
 * - No mock data - requires real API responses
 * - Graceful degradation if geocoding fails (weather data still available)
 * 
 * All temperatures in Fahrenheit per user preference
 */

// Cache for weather data (5 minute TTL)
interface WeatherCacheEntry {
  data: Awaited<ReturnType<typeof getWeather>>;
  timestamp: number;
}

const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cache for geocoding (1 hour TTL - location doesn't change often)
interface GeocodingCacheEntry {
  city: string | null;
  country: string | null;
  timestamp: number;
}

const geocodingCache = new Map<string, GeocodingCacheEntry>();
const GEOCODING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Rate limiting for Nominatim API (max 1 request/second per Nominatim Usage Policy)
let lastNominatimRequestTime = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1000; // 1 second minimum between requests

function getCacheKey(lat: number, lon: number): string {
  // Round to 2 decimal places for cache key (about 1km precision)
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export async function getWeather(input?: { lat?: number; lon?: number }): Promise<{
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
}> {
  let lat: number;
  let lon: number;
  let city: string | null = null;
  let country: string | null = null;

  // Use provided coordinates if available (from browser geolocation)
  if (input?.lat !== undefined && input?.lon !== undefined) {
    lat = input.lat;
    lon = input.lon;
  } else {
    // If no coordinates provided, we cannot determine location
    // Open-Meteo requires coordinates - we don't use IP geolocation
    // Return a helpful error message instead of throwing
    throw new Error(
      "Weather data requires location coordinates. " +
      "Please enable browser geolocation in your browser settings, " +
      "or provide latitude and longitude coordinates when calling this tool. " +
      "Note: This tool uses Open-Meteo which requires coordinates and does not support IP-based location detection."
    );
  }

  // Check cache first
  const cacheKey = getCacheKey(lat, lon);
  const cachedWeather = weatherCache.get(cacheKey);
  const now = Date.now();

  if (cachedWeather && (now - cachedWeather.timestamp) < WEATHER_CACHE_TTL_MS) {
    console.log("Using cached weather data");
    return cachedWeather.data;
  }

  // Check geocoding cache
  const cachedGeocoding = geocodingCache.get(cacheKey);
  if (cachedGeocoding && (now - cachedGeocoding.timestamp) < GEOCODING_CACHE_TTL_MS) {
    city = cachedGeocoding.city;
    country = cachedGeocoding.country;
    console.log("Using cached geocoding data:", city, country);
  } else {
    // Use Nominatim (OpenStreetMap) for reverse geocoding (coordinates to city/country)
    // Note: Open-Meteo doesn't support reverse geocoding, so we use Nominatim which is
    // also free, open-source, and commonly used alongside Open-Meteo
    // 
    // Nominatim Usage Policy compliance:
    // - Max 1 request per second (rate limited below)
    // - Proper User-Agent header per RFC 7231
    // - Respectful usage of free service
    try {
      // Rate limiting: Ensure minimum 1 second between Nominatim requests
      const timeSinceLastRequest = now - lastNominatimRequestTime;
      if (timeSinceLastRequest < NOMINATIM_MIN_INTERVAL_MS) {
        const waitTime = NOMINATIM_MIN_INTERVAL_MS - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      lastNominatimRequestTime = Date.now();

      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&zoom=10`;
      const nominatimResponse = await fetch(nominatimUrl, {
        signal: AbortSignal.timeout(10000),
        headers: {
          // RFC 7231 compliant User-Agent format: product/version (comment)
          // Nominatim Usage Policy requires identifying User-Agent
          'User-Agent': 'ZipWeatherApp/1.0 (https://github.com/phygital/zip; weather-service)'
        }
      });

      if (nominatimResponse.ok) {
        const nominatimData = await nominatimResponse.json();
        
        if (nominatimData.address) {
          const addr = nominatimData.address;
          // Try to get city from various possible fields
          city = addr.city || addr.town || addr.village || addr.municipality || 
                 addr.county || addr.state_district || addr.state || null;
          // Get country name
          country = addr.country || null;
          
          if (city && country) {
            console.log("Reverse geocoding successful:", lat, lon, city, country);
            // Cache geocoding result
            geocodingCache.set(cacheKey, { city, country, timestamp: now });
          } else {
            // If we got a response but missing city/country, cache null to avoid retries
            geocodingCache.set(cacheKey, { city: null, country: null, timestamp: now });
          }
        }
      } else {
        console.warn("Nominatim reverse geocoding failed:", nominatimResponse.status);
        // Cache the failure to avoid repeated failed calls
        geocodingCache.set(cacheKey, { city: null, country: null, timestamp: now });
      }
    } catch (geocodingError) {
      console.warn("Reverse geocoding failed (optional):", geocodingError);
      // Continue without city/country - weather data doesn't require it
      // Cache the failure (null values) to avoid repeated failed calls
      geocodingCache.set(cacheKey, { city: null, country: null, timestamp: now });
    }
  }

  // City/country are optional - we'll use fallback values if not available
  // Weather data will still be fetched successfully

  // Fetch comprehensive weather data from Open-Meteo Forecast API
  // All temperatures in Fahrenheit
  const forecastParams = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "ms", // meters per second
    timezone: "auto",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m",
      "surface_pressure",
      "cloud_cover",
      "visibility",
    ].join(","),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m",
      "precipitation_probability",
      "uv_index",
      "shortwave_radiation",
      "direct_radiation",
      "diffuse_radiation",
    ].join(","),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "weather_code",
      "precipitation_sum",
      "wind_speed_10m_max",
    ].join(","),
    forecast_days: "14",
  });

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`;
  
  // Also fetch elevation and air quality in parallel
  const elevationUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
  const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,ozone`;

  try {
    const [weatherResponse, elevationResponse, airQualityResponse] = await Promise.allSettled([
      fetch(weatherUrl, { signal: AbortSignal.timeout(15000) }),
      fetch(elevationUrl, { signal: AbortSignal.timeout(10000) }),
      fetch(airQualityUrl, { signal: AbortSignal.timeout(10000) }),
    ]);

    // Process weather forecast response
    if (weatherResponse.status === "rejected" || !weatherResponse.value.ok) {
      const error = weatherResponse.status === "rejected" 
        ? weatherResponse.reason 
        : `HTTP ${weatherResponse.value.status}`;
      throw new Error(`Weather API error: ${error}`);
    }

    const weatherData = await weatherResponse.value.json();

    if (!weatherData.current || weatherData.current.temperature_2m === undefined) {
      throw new Error("Weather API returned invalid data structure");
    }

    // Process elevation response
    let elevation: number | undefined;
    if (elevationResponse.status === "fulfilled" && elevationResponse.value.ok) {
      try {
        const elevationData = await elevationResponse.value.json();
        if (elevationData.elevation !== undefined) {
          elevation = Math.round(elevationData.elevation);
        }
      } catch (e) {
        console.warn("Failed to parse elevation data:", e);
      }
    }

    // Process air quality response
    let airQuality: {
      usAqi: number;
      pm10: number;
      pm25: number;
      ozone: number;
    } | undefined;
    if (airQualityResponse.status === "fulfilled" && airQualityResponse.value.ok) {
      try {
        const aqData = await airQualityResponse.value.json();
        if (aqData.current) {
          airQuality = {
            usAqi: Math.round(aqData.current.us_aqi || 0),
            pm10: Math.round((aqData.current.pm10 || 0) * 10) / 10,
            pm25: Math.round((aqData.current.pm2_5 || 0) * 10) / 10,
            ozone: Math.round((aqData.current.ozone || 0) * 10) / 10,
          };
        }
      } catch (e) {
        console.warn("Failed to parse air quality data:", e);
      }
    }

    // Map weather codes
    const currentWeatherCode = weatherData.current.weather_code || 0;
    const condition = mapWeatherCode(currentWeatherCode);

    // Process hourly forecast (next 24 hours)
    let hourlyForecast: Array<{
      time: string;
      tempF: number;
      condition: string;
      humidityPercent: number;
      windMs: number;
      precipitationProbability: number;
    }> | undefined;

    if (weatherData.hourly && weatherData.hourly.time) {
      const now = new Date();
      const next24Hours = weatherData.hourly.time
        .map((time: string, index: number) => {
          const timeDate = new Date(time);
          const hoursDiff = (timeDate.getTime() - now.getTime()) / (1000 * 60 * 60);
          return { time, index, hoursDiff };
        })
        .filter((item: { hoursDiff: number }) => item.hoursDiff >= 0 && item.hoursDiff <= 24)
        .slice(0, 24);

      hourlyForecast = next24Hours.map((item: { time: string; index: number }) => {
        const idx = item.index;
        return {
          time: item.time,
          tempF: Math.round((weatherData.hourly.temperature_2m[idx] || 0) * 10) / 10,
          condition: mapWeatherCode(weatherData.hourly.weather_code[idx] || 0),
          humidityPercent: Math.round(weatherData.hourly.relative_humidity_2m[idx] || 0),
          windMs: Math.round((weatherData.hourly.wind_speed_10m[idx] || 0) * 10) / 10,
          precipitationProbability: Math.round(weatherData.hourly.precipitation_probability[idx] || 0),
        };
      });
    }

    // Process daily forecast (next 7 days)
    let dailyForecast: Array<{
      date: string;
      tempMaxF: number;
      tempMinF: number;
      condition: string;
      precipitationSum: number;
      windMaxMs: number;
    }> | undefined;

    if (weatherData.daily && weatherData.daily.time) {
      dailyForecast = weatherData.daily.time.slice(0, 7).map((date: string, index: number) => ({
        date,
        tempMaxF: Math.round((weatherData.daily.temperature_2m_max[index] || 0) * 10) / 10,
        tempMinF: Math.round((weatherData.daily.temperature_2m_min[index] || 0) * 10) / 10,
        condition: mapWeatherCode(weatherData.daily.weather_code[index] || 0),
        precipitationSum: Math.round((weatherData.daily.precipitation_sum[index] || 0) * 10) / 10,
        windMaxMs: Math.round((weatherData.daily.wind_speed_10m_max[index] || 0) * 10) / 10,
      }));
    }

    // Get solar radiation data (current hour)
    let solarRadiation: {
      shortwave: number;
      direct: number;
      diffuse: number;
    } | undefined;

    if (weatherData.hourly && weatherData.hourly.time && weatherData.hourly.time.length > 0) {
      // Find current hour index
      const now = new Date();
      const currentHourIndex = weatherData.hourly.time.findIndex((time: string) => {
        const timeDate = new Date(time);
        return timeDate.getTime() <= now.getTime() && 
               (now.getTime() - timeDate.getTime()) < 3600000; // within 1 hour
      });

      if (currentHourIndex >= 0) {
        solarRadiation = {
          shortwave: Math.round((weatherData.hourly.shortwave_radiation[currentHourIndex] || 0) * 10) / 10,
          direct: Math.round((weatherData.hourly.direct_radiation[currentHourIndex] || 0) * 10) / 10,
          diffuse: Math.round((weatherData.hourly.diffuse_radiation[currentHourIndex] || 0) * 10) / 10,
        };
      }
    }

    // Extract timezone from response
    const timezone = weatherData.timezone || weatherData.timezone_abbreviation || undefined;

    // Calculate feels-like temperature (simplified - Open-Meteo doesn't provide this directly)
    // Using wind chill and heat index approximations
    const tempF = weatherData.current.temperature_2m;
    const windMs = weatherData.current.wind_speed_10m || 0;
    const humidity = weatherData.current.relative_humidity_2m || 0;
    let feelsLikeF = tempF;

    // Wind chill for cold temperatures (< 50°F and wind > 3 mph)
    if (tempF < 50 && windMs > 1.34) {
      feelsLikeF = 35.74 + 0.6215 * tempF - 35.75 * Math.pow(windMs * 2.237, 0.16) + 0.4275 * tempF * Math.pow(windMs * 2.237, 0.16);
    }
    // Heat index for hot temperatures (> 80°F)
    else if (tempF > 80 && humidity > 40) {
      const hi = -42.379 + 2.04901523 * tempF + 10.14333127 * humidity - 0.22475541 * tempF * humidity
        - 6.83783e-3 * tempF * tempF - 5.481717e-2 * humidity * humidity
        + 1.22874e-3 * tempF * tempF * humidity + 8.5282e-4 * tempF * humidity * humidity
        - 1.99e-6 * tempF * tempF * humidity * humidity;
      feelsLikeF = hi;
    }

    // Use fallback values if city/country not available from geocoding
    // Weather data is still valid without city/country names
    if (!city) city = `${lat.toFixed(2)}°N`;
    if (!country) country = `${lon.toFixed(2)}°E`;

    const result = {
      tempF: Math.round(tempF * 10) / 10,
    city,
    country,
    condition,
    humidityPercent: Math.round(weatherData.current.relative_humidity_2m || 0),
      windMs: Math.round((weatherData.current.wind_speed_10m || 0) * 10) / 10,
      feelsLikeF: Math.round(feelsLikeF * 10) / 10,
      pressure: weatherData.current.surface_pressure ? Math.round(weatherData.current.surface_pressure) : undefined,
      uvIndex: weatherData.hourly?.uv_index?.[0] ? Math.round(weatherData.hourly.uv_index[0]) : undefined,
      cloudCover: weatherData.current.cloud_cover ? Math.round(weatherData.current.cloud_cover) : undefined,
      visibility: weatherData.current.visibility ? Math.round(weatherData.current.visibility / 1000 * 10) / 10 : undefined, // Convert m to km
      hourlyForecast,
      dailyForecast,
      airQuality,
      elevation,
      timezone,
      solarRadiation,
    };

    // Cache the result
    weatherCache.set(cacheKey, { data: result, timestamp: now });

    // Clean up old cache entries (keep cache size reasonable)
    if (weatherCache.size > 10) {
      const oldestKey = Array.from(weatherCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      weatherCache.delete(oldestKey);
    }

    return result;
  } catch (error) {
    console.error("Weather data fetch error:", error);
    throw error instanceof Error ? error : new Error("Failed to fetch weather data");
  }
}

/**
 * Map Open-Meteo weather codes to human-readable conditions
 * Based on WMO Weather interpretation codes (WW)
 */
function mapWeatherCode(code: number): string {
  // Clear sky
  if (code === 0) return "Clear Sky";
  // Mainly clear
  if (code === 1) return "Mainly Clear";
  // Partly cloudy
  if (code === 2) return "Partly Cloudy";
  // Overcast
  if (code === 3) return "Overcast";
  // Fog
  if (code === 45 || code === 48) return "Fog";
  // Drizzle
  if (code >= 51 && code <= 55) return "Drizzle";
  // Freezing drizzle
  if (code >= 56 && code <= 57) return "Freezing Drizzle";
  // Rain
  if (code >= 61 && code <= 65) return "Rain";
  // Freezing rain
  if (code >= 66 && code <= 67) return "Freezing Rain";
  // Snow
  if (code >= 71 && code <= 75) return "Snow";
  // Snow grains
  if (code === 77) return "Snow Grains";
  // Rain showers
  if (code >= 80 && code <= 82) return "Rain Showers";
  // Snow showers
  if (code >= 85 && code <= 86) return "Snow Showers";
  // Thunderstorm
  if (code >= 95 && code <= 99) return "Thunderstorm";
  
  return "Unknown";
}
