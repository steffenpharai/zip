/**
 * Calendar tools
 * 
 * Calendar integration tools that gracefully handle cases where
 * calendar API integration is not configured. These tools provide
 * user-friendly error messages when calendar functionality is requested.
 * 
 * To enable calendar functionality, implement integration with a calendar
 * API such as Google Calendar or Outlook.
 */

import { z } from "zod";

export const calendarCreateEventSchema = z.object({
  title: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  description: z.string().optional(),
});

export const calendarCreateEventOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function calendarCreateEvent(input: z.infer<typeof calendarCreateEventSchema>): Promise<z.infer<typeof calendarCreateEventOutputSchema>> {
  return {
    success: false,
    message: `I'm unable to create calendar events at this time. Calendar integration is not currently configured. To use this feature, please set up a calendar API integration (such as Google Calendar or Outlook) in the system configuration.`,
  };
}

export const calendarListEventsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const calendarListEventsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  events: z.array(z.never()).default([]),
});

export async function calendarListEvents(input: z.infer<typeof calendarListEventsSchema>): Promise<z.infer<typeof calendarListEventsOutputSchema>> {
  return {
    success: false,
    message: `I'm unable to access your calendar at this time. Calendar integration is not currently configured. To use this feature, please set up a calendar API integration (such as Google Calendar or Outlook) in the system configuration.`,
    events: [],
  };
}

