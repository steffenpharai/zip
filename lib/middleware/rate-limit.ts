/**
 * Rate limiting middleware for tool endpoints
 * 
 * In-memory rate limiter (per-IP, per-tool)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store: IP -> Tool -> Entry
const rateLimitStore = new Map<string, Map<string, RateLimitEntry>>();

// Default: 100 requests per minute per IP
const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Get client IP from request
 */
function getClientIp(request: Request): string {
  // Try various headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  
  // Fallback to a default key if no IP available
  return "unknown";
}

/**
 * Check if request is within rate limit
 */
export function checkRateLimit(
  request: Request,
  toolName?: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS
): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = getClientIp(request);
  const key = toolName || "global";
  const now = Date.now();
  
  // Get or create IP entry
  let ipMap = rateLimitStore.get(ip);
  if (!ipMap) {
    ipMap = new Map();
    rateLimitStore.set(ip, ipMap);
  }
  
  // Get or create tool entry
  let entry = ipMap.get(key);
  if (!entry || entry.resetAt < now) {
    // Reset or create new entry
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    ipMap.set(key, entry);
  }
  
  // Check limit
  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }
  
  // Increment count
  entry.count++;
  
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Clean up old entries (call periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  
  for (const [ip, ipMap] of rateLimitStore.entries()) {
    for (const [key, entry] of ipMap.entries()) {
      if (entry.resetAt < now) {
        ipMap.delete(key);
      }
    }
    
    if (ipMap.size === 0) {
      rateLimitStore.delete(ip);
    }
  }
}

// Cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}

