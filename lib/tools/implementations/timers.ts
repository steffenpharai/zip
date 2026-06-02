/**
 * Timer management tools
 * 
 * Server-side timer scheduling with reminders via events
 */

import { z } from "zod";

interface Timer {
  id: string;
  seconds: number;
  message: string;
  callback: () => void;
  timeoutId: NodeJS.Timeout;
  createdAt: number;
}

const activeTimers = new Map<string, Timer>();

/**
 * Generate unique timer ID
 */
function generateTimerId(): string {
  return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const createTimerSchema = z.object({
  seconds: z.number().int().positive().max(3600), // Max 1 hour
  message: z.string().min(1).max(500),
});

export const createTimerOutputSchema = z.object({
  id: z.string(),
  seconds: z.number(),
  message: z.string(),
  firesAt: z.number(),
});

export async function createTimer(input: z.infer<typeof createTimerSchema>): Promise<z.infer<typeof createTimerOutputSchema>> {
  const id = generateTimerId();
  const firesAt = Date.now() + input.seconds * 1000;
  
  // Create timeout
  const timeoutId = setTimeout(() => {
    // Timer fired - emit event (handled by agent route or event system)
    // For now, we'll store it and the agent route can check for fired timers
    activeTimers.delete(id);
    
    // In a real implementation, this would emit an event or send SSE/WebSocket message
    console.log(`Timer ${id} fired: ${input.message}`);
  }, input.seconds * 1000);
  
  const timer: Timer = {
    id,
    seconds: input.seconds,
    message: input.message,
    callback: () => {
      // Timer callback
    },
    timeoutId,
    createdAt: Date.now(),
  };
  
  activeTimers.set(id, timer);
  
  return {
    id,
    seconds: input.seconds,
    message: input.message,
    firesAt,
  };
}

export const cancelTimerSchema = z.object({
  id: z.string(),
});

export const cancelTimerOutputSchema = z.object({
  success: z.boolean(),
  id: z.string(),
});

export async function cancelTimer(input: z.infer<typeof cancelTimerSchema>): Promise<z.infer<typeof cancelTimerOutputSchema>> {
  const timer = activeTimers.get(input.id);
  
  if (!timer) {
    return {
      success: false,
      id: input.id,
    };
  }
  
  clearTimeout(timer.timeoutId);
  activeTimers.delete(input.id);
  
  return {
    success: true,
    id: input.id,
  };
}

/**
 * Get all active timers (for debugging/admin)
 */
export function getActiveTimers(): Timer[] {
  return Array.from(activeTimers.values());
}

