import mongoose from 'mongoose';

const trackerSchema = new mongoose.Schema({
  movieLabel: { type: String, trim: true, maxlength: 120, default: '' },
  bookMyShowUrl: { type: String, required: true, trim: true },
  pollingIntervalMinutes: { type: Number, required: true, min: 1 },
  durationMinutes: { type: Number, required: true, min: 1 },
  timezone: { type: String, required: true, default: 'Asia/Kolkata' },
  maximumChecks: { type: Number, min: 1, default: null },
  attemptedChecks: { type: Number, default: 0, min: 0 },
  successfulChecks: { type: Number, default: 0, min: 0 },
  consecutiveFailures: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['RUNNING', 'PAUSED', 'STOPPED', 'COMPLETED', 'ERROR'],
    default: 'RUNNING',
    index: true
  },
  providerMode: { type: String, enum: ['mock', 'manual', 'live'], default: 'mock' },
  clockAligned: { type: Boolean, default: false },
  startedAt: { type: Date, required: true },
  endsAt: { type: Date, required: true, index: true },
  nextPollAt: { type: Date, default: null, index: true },
  lastPolledAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  pollLeaseUntil: { type: Date, default: null },
  pollLeaseToken: { type: String, default: null }
}, { timestamps: true });

trackerSchema.index({ status: 1, nextPollAt: 1, pollLeaseUntil: 1 });
trackerSchema.index({ createdAt: -1 });

export default mongoose.model('Tracker', trackerSchema);
