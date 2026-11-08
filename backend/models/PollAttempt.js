import mongoose from 'mongoose';

const pollAttemptSchema = new mongoose.Schema({
  trackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tracker', required: true, index: true },
  attemptedAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ['SUCCESS', 'NEEDS_REVIEW', 'FAILED'], required: true },
  errorCode: { type: String, default: null },
  errorMessage: { type: String, default: null, maxlength: 500 },
  nextRetryAt: { type: Date, default: null }
}, { timestamps: true });

pollAttemptSchema.index({ trackerId: 1, attemptedAt: -1 });

export default mongoose.model('PollAttempt', pollAttemptSchema);
