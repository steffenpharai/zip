/**
 * Robot Advanced Control Tools (ACT tier)
 * 
 * Tools for advanced robot control: servo, macros, configuration, etc.
 * These require user confirmation before execution.
 * Uses MCP client for ROS 2 service calls.
 */

import { z } from "zod";

// ============================================================================
// robot_servo_control - Control pan servo
// ============================================================================

export const robotServoControlSchema = z.object({
  angle: z.number().min(0).max(180).describe("Servo angle in degrees (0-180)"),
});

export const robotServoControlOutputSchema = z.object({
  success: z.boolean(),
  angle: z.number(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotServoControl(
  input: z.infer<typeof robotServoControlSchema>
): Promise<z.infer<typeof robotServoControlOutputSchema>> {
  // This will be executed via MCP
  throw new Error("robot_servo_control should be executed via MCP");
}

// ============================================================================
// robot_macro_execute - Execute motion macro
// ============================================================================

export const robotMacroExecuteSchema = z.object({
  macro_id: z.number().int().min(1).max(4).describe("Macro ID: 1=FIGURE_8, 2=SPIN_360, 3=WIGGLE, 4=FORWARD_THEN_STOP"),
  intensity: z.number().int().min(0).max(255).optional().default(128).describe("Intensity 0-255 (default: 128)"),
  ttl_ms: z.number().int().min(1000).max(10000).optional().default(5000).describe("Time-to-live in milliseconds 1000-10000 (default: 5000)"),
});

export const robotMacroExecuteOutputSchema = z.object({
  success: z.boolean(),
  macro_id: z.number(),
  macro_name: z.string(),
  intensity: z.number(),
  ttl_ms: z.number(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotMacroExecute(
  input: z.infer<typeof robotMacroExecuteSchema>
): Promise<z.infer<typeof robotMacroExecuteOutputSchema>> {
  // This will be executed via MCP
  throw new Error("robot_macro_execute should be executed via MCP");
}

// ============================================================================
// robot_macro_cancel - Cancel active macro
// ============================================================================

export const robotMacroCancelSchema = z.object({});

export const robotMacroCancelOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotMacroCancel(
  _input: z.infer<typeof robotMacroCancelSchema>
): Promise<z.infer<typeof robotMacroCancelOutputSchema>> {
  // This will be executed via MCP
  throw new Error("robot_macro_cancel should be executed via MCP");
}

// ============================================================================
// robot_direct_motor_control - Direct PWM control (WARNING: bypasses safety)
// ============================================================================

export const robotDirectMotorControlSchema = z.object({
  left_pwm: z.number().int().min(-255).max(255).describe("Left motor PWM (-255 to 255)"),
  right_pwm: z.number().int().min(-255).max(255).describe("Right motor PWM (-255 to 255)"),
});

export const robotDirectMotorControlOutputSchema = z.object({
  success: z.boolean(),
  left_pwm: z.number(),
  right_pwm: z.number(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotDirectMotorControl(
  input: z.infer<typeof robotDirectMotorControlSchema>
): Promise<z.infer<typeof robotDirectMotorControlOutputSchema>> {
  // This will be executed via MCP
  throw new Error("robot_direct_motor_control should be executed via MCP");
}

// ============================================================================
// robot_rerun_init - Re-run initialization sequence
// ============================================================================

export const robotRerunInitSchema = z.object({});

export const robotRerunInitOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotRerunInit(
  _input: z.infer<typeof robotRerunInitSchema>
): Promise<z.infer<typeof robotRerunInitOutputSchema>> {
  // This will be executed via MCP
  throw new Error("robot_rerun_init should be executed via MCP");
}

// ============================================================================
// robot_set_drive_config - Configure drive safety parameters
// ============================================================================

export const robotSetDriveConfigSchema = z.object({
  parameter: z.number().int().min(1).max(5).describe("Parameter ID: 1=deadband, 2=accel_step, 3=decel_step, 4=kick_enable, 5=max_pwm_cap"),
  value: z.number().int().min(0).max(65535).describe("Parameter value (see firmware docs for encoding)"),
});

export const robotSetDriveConfigOutputSchema = z.object({
  success: z.boolean(),
  parameter: z.number(),
  parameter_name: z.string(),
  value: z.number(),
  message: z.string(),
  error: z.string().nullable(),
});

export async function robotSetDriveConfig(
  input: z.infer<typeof robotSetDriveConfigSchema>
): Promise<z.infer<typeof robotSetDriveConfigOutputSchema>> {
  // This will be executed via MCP
  throw new Error("robot_set_drive_config should be executed via MCP");
}
