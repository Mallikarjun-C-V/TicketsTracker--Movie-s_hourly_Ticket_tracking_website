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
app.use(cors({ origin: env.FRONTEND_URL, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '20kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      provider: env.BMS_PROVIDER,
      liveProviderEnabled: env.LIVE_PROVIDER_READY,
      minimumPollingIntervalMinutes: env.MIN_POLL_INTERVAL_MINUTES,
      defaultTimezone: env.DEFAULT_TIMEZONE
    }
  });
});

app.use('/api/trackers', trackerRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
