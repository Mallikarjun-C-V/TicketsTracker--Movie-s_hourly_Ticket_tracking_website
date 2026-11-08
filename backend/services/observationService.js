import TicketSnapshot from '../models/TicketSnapshot.js';
import PollAttempt from '../models/PollAttempt.js';
import { getRollingWindow } from '../utils/timeWindows.js';

export async function storeProviderResult(tracker, result, attemptedAt = new Date()) {
  const status = result.precision === 'REVIEW' ? 'NEEDS_REVIEW' : 'SUCCESS';
  const window = getRollingWindow(result.observedAt || attemptedAt, result.metricWindowMinutes || 60);

  const snapshot = await TicketSnapshot.create({
    trackerId: tracker._id,
    observedAt: result.observedAt || attemptedAt,
    ...window,
    ticketsSold: Number.isFinite(result.ticketsSold) ? result.ticketsSold : null,
    rawDisplayedText: result.rawDisplayedText || 'Unparsed source text',
    precision: result.precision || 'REVIEW',
    sourceProvider: result.sourceProvider || 'MOCK',
    extractionStatus: status
  });

  await PollAttempt.create({ trackerId: tracker._id, attemptedAt, status });
  return { snapshot, status };
}

export async function storeFailedAttempt(trackerId, result, attemptedAt = new Date(), nextRetryAt = null) {
  return PollAttempt.create({
    trackerId,
    attemptedAt,
    status: 'FAILED',
    errorCode: result.errorCode || 'COLLECTION_FAILED',
    errorMessage: result.errorMessage || 'The data collection attempt failed.',
    nextRetryAt
  });
}

export async function storeManualObservation(tracker, input, attemptedAt = new Date()) {
  const observedAt = attemptedAt;
  const window = getRollingWindow(observedAt, 60);
  const rawDisplayedText = input.rawDisplayedText || `${input.ticketsSold.toLocaleString('en-IN')} tickets sold in the last 1 hour (manual observation)`;
  const snapshot = await TicketSnapshot.create({
    trackerId: tracker._id,
    observedAt,
    ...window,
    ticketsSold: input.ticketsSold,
    rawDisplayedText,
    precision: input.precision,
    sourceProvider: 'MANUAL',
    extractionStatus: 'SUCCESS'
  });
  await PollAttempt.create({ trackerId: tracker._id, attemptedAt, status: 'SUCCESS' });
  return snapshot;
}
