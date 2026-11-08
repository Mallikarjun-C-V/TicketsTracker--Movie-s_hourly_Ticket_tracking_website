import { z } from 'zod';
import { env } from '../config/env.js';

function isTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const createTrackerSchema = z.object({
  bookMyShowUrl: z.string().min(12).max(2048),
  movieLabel: z.string().trim().max(120).optional().default(''),
  pollingIntervalMinutes: z.number().finite().min(env.MIN_POLL_INTERVAL_MINUTES).max(10080),
  durationMinutes: z.number().finite().int().min(1).max(43200),
  maximumChecks: z.number().int().min(1).max(10000).nullable().optional().default(null),
  timezone: z.string().refine(isTimezone, 'Choose a valid IANA timezone.'),
  clockAligned: z.boolean().optional().default(false)
});

export const manualObservationSchema = z.object({
  ticketsSold: z.number().finite().int().min(0).max(Number.MAX_SAFE_INTEGER),
  rawDisplayedText: z.string().trim().min(1).max(1000).optional(),
  precision: z.enum(['EXACT', 'APPROXIMATE']).default('EXACT')
});
