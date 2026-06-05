/**
 * Moonraker API client for 3D printer communication
 * 
 * Handles HTTP requests to Moonraker (Klipper API server)
 * with timeout protection, error handling, and retry logic
 */

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds default
const LONG_OPERATION_TIMEOUT_MS = 30000; // 30 seconds for file uploads

/**
 * Get printer API base URL from environment variable
 */
export function getPrinterBaseUrl(): string {
  const url = process.env.PRINTER_API_URL || "http://169.254.178.90";
  
  // Validate URL is safe (local network only)
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    
    // Allow localhost, 169.254.x.x (link-local), and private IP ranges
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isLinkLocal = hostname.startsWith("169.254.");
    const isPrivateIP = 
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") || hostname.startsWith("172.17.") ||
      hostname.startsWith("172.18.") || hostname.startsWith("172.19.") ||
      hostname.startsWith("172.20.") || hostname.startsWith("172.21.") ||
      hostname.startsWith("172.22.") || hostname.startsWith("172.23.") ||
      hostname.startsWith("172.24.") || hostname.startsWith("172.25.") ||
      hostname.startsWith("172.26.") || hostname.startsWith("172.27.") ||
      hostname.startsWith("172.28.") || hostname.startsWith("172.29.") ||
      hostname.startsWith("172.30.") || hostname.startsWith("172.31.") ||
      hostname.startsWith("192.168.");
    
    if (!isLocalhost && !isLinkLocal && !isPrivateIP) {
      throw new Error(`Printer URL must be a local network address, got: ${hostname}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be a local network address")) {
      throw error;
    }
    throw new Error(`Invalid printer URL: ${url}`);
  }
  
  return url;
}

export interface MoonrakerResponse<T = unknown> {
  result: T;
}

export interface MoonrakerError {
  error: {
    message: string;
    code?: number;
  };
}

/**
 * Make a request to the Moonraker API
 */
export async function moonrakerRequest<T = unknown>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const baseUrl = getPrinterBaseUrl().replace(/\/$/, ""); // Remove trailing slash
  const endpointPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${endpointPath}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const options: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
    };
    
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json() as MoonrakerError;
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Ignore JSON parse errors, use default message
      }
      
      throw new Error(`Printer API error: ${errorMessage}`);
    }
    
    const data = await response.json() as MoonrakerResponse<T>;
    
    // Moonraker wraps responses in { result: ... }
    return data.result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(`Printer request timeout after ${timeoutMs}ms`);
      }
      if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
        throw new Error("Printer is offline or unreachable. Please check the printer connection and IP address.");
      }
      throw error;
    }
    
    throw new Error("Unknown error communicating with printer");
  }
}

/**
 * Make a request with retry logic
 */
export async function moonrakerRequestWithRetry<T = unknown>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await moonrakerRequest<T>(endpoint, method, body, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on timeout or connection errors (printer is likely offline)
      if (lastError.message.includes("timeout") || lastError.message.includes("offline") || lastError.message.includes("unreachable")) {
        throw lastError;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  throw lastError || new Error("Printer request failed after retries");
}

/**
 * Get timeout for long operations (file uploads)
 */
export function getLongOperationTimeout(): number {
  return LONG_OPERATION_TIMEOUT_MS;
}

