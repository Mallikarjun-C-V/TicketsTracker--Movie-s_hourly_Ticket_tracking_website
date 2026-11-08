import mongoose from 'mongoose';

const ticketSnapshotSchema = new mongoose.Schema({
  trackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tracker', required: true, index: true },
  observedAt: { type: Date, required: true, index: true },
  windowStart: { type: Date, required: true },
  windowEnd: { type: Date, required: true },
  metricWindowMinutes: { type: Number, required: true, default: 60 },
  ticketsSold: { type: Number, min: 0, default: null },
  rawDisplayedText: { type: String, required: true, maxlength: 1000 },
  precision: { type: String, enum: ['EXACT', 'APPROXIMATE', 'REVIEW'], required: true },
  sourceProvider: { type: String, enum: ['MOCK', 'MANUAL', 'BOOKMYSHOW'], required: true },
  extractionStatus: { type: String, enum: ['SUCCESS', 'NEEDS_REVIEW'], default: 'SUCCESS' }
}, { timestamps: true });

ticketSnapshotSchema.index({ trackerId: 1, observedAt: 1 });

export default mongoose.model('TicketSnapshot', ticketSnapshotSchema);
