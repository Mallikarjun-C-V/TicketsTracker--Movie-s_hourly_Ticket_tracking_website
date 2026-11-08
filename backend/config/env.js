import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}, z.boolean());

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/ticketstracker'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BMS_PROVIDER: z.enum(['mock', 'manual', 'live']).default('mock'),
  BMS_SCRAPING_ENABLED: booleanFromEnv.default(false),
  BMS_AUTHORIZED: booleanFromEnv.default(false),
  BMS_ALLOWED_HOSTS: z.string().default('in.bookmyshow.com'),
  BMS_COUNTER_SELECTOR: z.string().default('.sc-1qdowf4-0.iGNlkn'),
  BMS_COUNTER_REGEX: z.string().default(''),
  MIN_POLL_INTERVAL_MINUTES: z.coerce.number().min(1).default(10),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  BROWSER_HEADLESS: booleanFromEnv.default(true),
  BROWSER_NAVIGATION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(50000).default(20000)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const value = parsed.data;
const allowedHosts = value.BMS_ALLOWED_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);

export const env = Object.freeze({
  ...value,
  BMS_ALLOWED_HOSTS: allowedHosts,
  LIVE_PROVIDER_READY: value.BMS_PROVIDER === 'live' && value.BMS_SCRAPING_ENABLED && value.BMS_AUTHORIZED
});
