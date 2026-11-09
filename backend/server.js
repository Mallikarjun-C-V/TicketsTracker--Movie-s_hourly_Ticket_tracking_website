import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { startScheduler, stopScheduler } from './scheduler/persistentScheduler.js';

let server;

async function start() {
  try {
    await connectDatabase();
    startScheduler();
    server = app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`TicketsTracker API listening at http://localhost:${env.PORT}`);
      console.log(`Collection provider: ${env.BMS_PROVIDER}${env.LIVE_PROVIDER_READY ? ' (authorized live mode enabled)' : ''}`);
    });
  } catch (error) {
    console.error('Unable to start TicketsTracker:', error?.message || error);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down TicketsTracker...`);
  await stopScheduler();
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await start();
