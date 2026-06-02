/**
 * Firmware JSON Protocol
 * Type definitions, builders, and validators for ELEGOO-style JSON protocol
 * 
 * Firmware Protocol Reference:
 * - Commands: {"N":<cmd>,"H":"<tag>","D1":<val>,"D2":<val>,"T":<ttl>}
 * - Responses: {H_ok}, {H_false}, {H_true}, {H_value}, or diagnostics lines
 */

import { z } from 'zod';
import { STREAM_MIN_TTL_MS, STREAM_MAX_TTL_MS } from '../config/env.js';

// ============================================================================
// Command Numbers (N values)
// ============================================================================

export const CMD = {
  HELLO: 0,
  DIAGNOSTICS: 120,
  SETPOINT: 200,
  STOP: 201,
  MACRO_START: 210,
  MACRO_CANCEL: 211,
  DIRECT_MOTOR: 999,
  
  // Legacy ELEGOO commands (1-199, for compatibility)
  SERVO: 5,
  ULTRASONIC: 21,
  LINE_SENSOR: 22,
  CLEAR_MODE: 100,
  CLEAR_STATE: 110,
} as const;

export type CmdNumber = typeof CMD[keyof typeof CMD];

// Commands that expect a reply
export const COMMANDS_EXPECTING_REPLY = new Set([
  CMD.HELLO,        // {H_ok}
  CMD.DIAGNOSTICS,  // Multi-line diagnostics
  CMD.STOP,         // {H_ok}
  CMD.MACRO_START,  // {H_ok}
  CMD.MACRO_CANCEL, // {H_ok}
  CMD.DIRECT_MOTOR, // {H_ok}
  CMD.SERVO,        // {H_ok}
  CMD.ULTRASONIC,   // {H_<distance>} or {H_true/false}
  CMD.LINE_SENSOR,  // {H_<value>}
  23,               // Battery: {H_<voltage>}
]);

// Commands that do NOT expect a reply (fire-and-forget)
export const COMMANDS_NO_REPLY = new Set([
  CMD.SETPOINT,     // N=200 - streaming, no response
]);

// ============================================================================
// Command Schemas
// ============================================================================

export const FirmwareCommandSchema = z.object({
  N: z.number().int(),
  H: z.string().optional(),
  D1: z.number().optional(),
  D2: z.number().optional(),
  T: z.number().int().optional(),
});

export type FirmwareCommand = z.infer<typeof FirmwareCommandSchema>;

// ============================================================================
// Response Token Patterns
// ============================================================================

// Token responses like {H_ok}, {hello_ok}, {stop1_ok}, {ultra_123}, etc.
// Firmware format: {<tag>_<result>} where result is ok/false/true/value/number
const TOKEN_PATTERN = /^\{(\w+)_(\w+)\}$/;

// Diagnostics response patterns
// Format from firmware: {<owner><L>,<R>,<stby>,<state>,<resets>[,ram:<ram>,min:<min>]}
// Note: ram and min are optional (newer firmware)
const DIAG_OWNER_PATTERN = /^\{([IDX])(-?\d+),(-?\d+),(\d+),(\d+),(\d+)(?:,ram:\d+,min:\d+)?\}$/;
// Stats line: {stats:rx=<rx>,jd=<jd>,pe=<pe>[,bc=<bc>],tx=<tx>,ms=<ms>}
// Note: bc field is optional (missing in some firmware versions)
const DIAG_STATS_PATTERN = /^\{stats:rx=(\d+),jd=(\d+),pe=(\d+)(?:,bc=\d+)?,tx=(\d+),ms=(\d+)\}$/;

export type TokenKind = 'ok' | 'false' | 'true' | 'value' | 'unknown';

export interface TokenResponse {
  kind: 'token';
  token: string;
  tokenKind: TokenKind;
}

export interface DiagnosticsResponse {
  kind: 'diagnostics';
  lines: string[];
}

export interface BootMarkerResponse {
  kind: 'boot';
}

export type FirmwareResponse = TokenResponse | DiagnosticsResponse | BootMarkerResponse;

// ============================================================================
// Response Parsing
// ============================================================================

export function isBootMarker(line: string): boolean {
  return line.trim() === 'R';
}

export function isReadyMarker(line: string): boolean {
  const trimmed = line.trim();
  // Match "READY" or "[NET] READY" patterns
  return trimmed === 'READY' || trimmed.endsWith(' READY') || trimmed.includes('[NET] READY');
}

export function isTokenResponse(line: string): boolean {
  return TOKEN_PATTERN.test(line.trim());
}

export function parseTokenResponse(line: string): TokenResponse | null {
  const match = line.trim().match(TOKEN_PATTERN);
  if (!match) return null;
  
  // match[1] is the tag (e.g., "hello", "H", "stop1", "ultra")
  // match[2] is the result (e.g., "ok", "false", "true", "123", etc.)
  const result = match[2].toLowerCase();
  let tokenKind: TokenKind;
  
  switch (result) {
    case 'ok': tokenKind = 'ok'; break;
    case 'false': tokenKind = 'false'; break;
    case 'true': tokenKind = 'true'; break;
    default: 
      // Check if it's a numeric value
      tokenKind = /^\d+$/.test(result) ? 'value' : 'unknown';
  }
  
  return {
    kind: 'token',
    token: line.trim(),
    tokenKind,
  };
}

export function isDiagnosticsLine(line: string): boolean {
  const trimmed = line.trim();
  return DIAG_OWNER_PATTERN.test(trimmed) || DIAG_STATS_PATTERN.test(trimmed);
}

// ============================================================================
// Command Builders
// ============================================================================

export function buildHelloCommand(tag?: string): FirmwareCommand {
  return { N: CMD.HELLO, H: tag };
}

export function buildDiagnosticsCommand(tag?: string): FirmwareCommand {
  return { N: CMD.DIAGNOSTICS, H: tag };
}

export function buildStopCommand(tag?: string): FirmwareCommand {
  return { N: CMD.STOP, H: tag };
}

export function buildSetpointCommand(v: number, w: number, ttlMs: number): FirmwareCommand {
  return {
    N: CMD.SETPOINT,
    D1: clampPWM(v),
    D2: clampPWM(w),
    T: clampTTL(ttlMs),
  };
}

export function buildDirectMotorCommand(left: number, right: number, tag?: string): FirmwareCommand {
  return {
    N: CMD.DIRECT_MOTOR,
    H: tag,
    D1: clampPWM(left),
    D2: clampPWM(right),
  };
}

export function buildMacroStartCommand(macroId: number, tag?: string): FirmwareCommand {
  return {
    N: CMD.MACRO_START,
    H: tag,
    D1: macroId,
  };
}

export function buildMacroCancelCommand(tag?: string): FirmwareCommand {
  return { N: CMD.MACRO_CANCEL, H: tag };
}

// ============================================================================
// Value Clamping
// ============================================================================

export function clampPWM(value: number): number {
  return Math.max(-255, Math.min(255, Math.round(value)));
}

export function clampTTL(ttlMs: number): number {
  return Math.max(STREAM_MIN_TTL_MS, Math.min(STREAM_MAX_TTL_MS, Math.round(ttlMs)));
}

export function clampRateHz(rateHz: number, maxHz: number): number {
  return Math.max(1, Math.min(maxHz, Math.round(rateHz)));
}

// ============================================================================
// Serialization
// ============================================================================

export function serializeCommand(cmd: FirmwareCommand): string {
  // Build minimal JSON (omit undefined fields)
  const obj: Record<string, unknown> = { N: cmd.N };
  if (cmd.H !== undefined) obj.H = cmd.H;
  if (cmd.D1 !== undefined) obj.D1 = cmd.D1;
  if (cmd.D2 !== undefined) obj.D2 = cmd.D2;
  if (cmd.T !== undefined) obj.T = cmd.T;
  
  return JSON.stringify(obj);
}

// ============================================================================
// Priority Levels
// ============================================================================

export const PRIORITY = {
  STOP: 0,        // Highest - N=201 stop
  DIAGNOSTICS: 1, // N=120
  DIRECT_MOTOR: 2,// N=999
  COMMAND: 3,     // Other commands expecting replies
  STREAM: 4,      // N=200 setpoints (lowest, coalesced)
} as const;

export function getPriorityForCommand(n: number): number {
  switch (n) {
    case CMD.STOP: return PRIORITY.STOP;
    case CMD.DIAGNOSTICS: return PRIORITY.DIAGNOSTICS;
    case CMD.DIRECT_MOTOR: return PRIORITY.DIRECT_MOTOR;
    case CMD.SETPOINT: return PRIORITY.STREAM;
    default: return PRIORITY.COMMAND;
  }
}

