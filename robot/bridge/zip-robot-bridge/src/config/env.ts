/**
 * Environment Configuration
 * Validates and exports all environment variables
 */

import { z } from 'zod';

const envSchema = z.object({
  // Serial configuration
  SERIAL_PORT: z.string().optional(),
  SERIAL_BAUD: z.coerce.number().int().positive().default(115200),
  
  // Server ports
  WS_PORT: z.coerce.number().int().min(1).max(65535).default(8765),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8766),
  
  // Loopback mode (no hardware)
  LOOPBACK_MODE: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  
  // Debug mode
  DEBUG: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  
  // Streaming defaults
  STREAM_DEFAULT_RATE_HZ: z.coerce.number().int().min(1).max(20).default(10),
  STREAM_MAX_RATE_HZ: z.coerce.number().int().min(1).max(20).default(20),
  STREAM_DEFAULT_TTL_MS: z.coerce.number().int().min(100).max(500).default(200),
  STREAM_MIN_TTL_MS: z.coerce.number().int().min(100).max(300).default(150),
  STREAM_MAX_TTL_MS: z.coerce.number().int().min(200).max(500).default(300),
  
  // Rate limiting
  MAX_COMMANDS_PER_SEC: z.coerce.number().int().min(1).max(100).default(50),
  
  // Timeouts
  HANDSHAKE_TIMEOUT_MS: z.coerce.number().int().min(500).max(5000).default(5000),
  COMMAND_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).default(250),
  DIAGNOSTICS_COLLECT_MS: z.coerce.number().int().min(30).max(200).default(80),
  DTR_SETTLE_MS: z.coerce.number().int().min(300).max(2000).default(700),
  
  // Logging
  LOG_PATH: z.string().default('./data/bridge.log'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('[Config] Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    // Return defaults on error
    return envSchema.parse({});
  }
  
  return result.data;
}

export const env = loadEnv();

// Re-export individual values for convenience
export const {
  SERIAL_PORT,
  SERIAL_BAUD,
  WS_PORT,
  HTTP_PORT,
  LOOPBACK_MODE,
  DEBUG,
  STREAM_DEFAULT_RATE_HZ,
  STREAM_MAX_RATE_HZ,
  STREAM_DEFAULT_TTL_MS,
  STREAM_MIN_TTL_MS,
  STREAM_MAX_TTL_MS,
  MAX_COMMANDS_PER_SEC,
  HANDSHAKE_TIMEOUT_MS,
  COMMAND_TIMEOUT_MS,
  DIAGNOSTICS_COLLECT_MS,
  DTR_SETTLE_MS,
  LOG_PATH,
} = env;

