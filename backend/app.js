
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import trackerRoutes from './routes/trackerRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());

app.use(cors({
  origin: env.FRONTEND_URL,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '20kb' }));

app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

// Health check and Vercel server region verification
app.get('/api/health', (req, res) => {
  const region = process.env.VERCEL_REGION || 'Unknown';

  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      region,
      location: region === 'bom1'
        ? 'Mumbai, India'
        : 'Region not confirmed as Mumbai',
      provider: env.BMS_PROVIDER,
      liveProviderEnabled: env.LIVE_PROVIDER_READY,
      minimumPollingIntervalMinutes: env.MIN_POLL_INTERVAL_MINUTES,
      defaultTimezone: env.DEFAULT_TIMEZONE
    }
  });
});

// Tracker routes
app.use('/api/trackers', trackerRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;
