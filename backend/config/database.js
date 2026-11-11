import mongoose from 'mongoose';
import { env } from './env.js';

let connecting = null;

export function connectDatabase() {
  // Already connected: reuse it (important on serverless, where warm instances are reused)
  if (mongoose.connection.readyState === 1) return Promise.resolve();

  // Connection already in progress: wait for the same one instead of starting another
  if (!connecting) {
    mongoose.set('strictQuery', true);
    connecting = mongoose
      .connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        autoIndex: env.NODE_ENV !== 'production'
      })
      .then(() => {
        console.log(`MongoDB connected: ${mongoose.connection.name}`);
      })
      .catch((error) => {
        connecting = null; // allow a retry on the next request
        throw error;
      });
  }
  return connecting;
}

export async function disconnectDatabase() {
  connecting = null;
  await mongoose.disconnect();
}