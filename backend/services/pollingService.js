import { randomUUID } from 'node:crypto';
import Tracker from '../models/Tracker.js';
import { env } from '../config/env.js';
import { getProvider } from '../scraper/providerFactory.js';
import { storeFailedAttempt, storeProviderResult } from './observationService.js';
import { getNextPollAt, isTrackerLimitReached } from '../utils/timeWindows.js';

const LEASE_MS = 120_000;
const RETRYABLE_CODES = new Set(['PAGE_TIMEOUT', 'LIVE_COLLECTION_FAILED', 'BROWSER_LAUNCH_FAILED', 'DNS_LOOKUP_FAILED']);
const PAUSE_CODES = new Set(['CAPTCHA_DETECTED', 'ACCESS_DENIED', 'LIVE_PROVIDER_DISABLED', 'UNSAFE_DESTINATION', 'PRIVATE_DESTINATION_BLOCKED']);

export async function finishExpiredTrackers(now = new Date()) {
  await Tracker.updateMany(
    { status: 'RUNNING', endsAt: { $lte: now } },
    { $set: { status: 'COMPLETED', completedAt: now, nextPollAt: null, pollLeaseUntil: null, pollLeaseToken: null } }
  );
  await Tracker.updateMany(
    { status: 'RUNNING', maximumChecks: { $ne: null }, $expr: { $gte: ['$attemptedChecks', '$maximumChecks'] } },
    { $set: { status: 'COMPLETED', completedAt: now, nextPollAt: null, pollLeaseUntil: null, pollLeaseToken: null } }
  );
}

async function claimDueTracker(now = new Date()) {
  const token = randomUUID();
  const tracker = await Tracker.findOneAndUpdate(
    {
      status: 'RUNNING',
      providerMode: { $ne: 'manual' },
      nextPollAt: { $lte: now },
      endsAt: { $gt: now },
      $or: [{ maximumChecks: null }, { $expr: { $lt: ['$attemptedChecks', '$maximumChecks'] } }],
      $and: [{ $or: [{ pollLeaseUntil: null }, { pollLeaseUntil: { $lte: now } }] }]
    },
    { $set: { pollLeaseUntil: new Date(now.getTime() + LEASE_MS), pollLeaseToken: token } },
    { new: true, sort: { nextPollAt: 1 } }
  );
  return tracker ? { tracker, token } : null;
}

async function completeAfterAttempt(trackerId, token, patch, now) {
  const tracker = await Tracker.findById(trackerId);
  if (!tracker || tracker.pollLeaseToken !== token) return;

  const attemptedChecks = tracker.attemptedChecks + (patch.incrementAttempt ? 1 : 0);
  const successfulChecks = tracker.successfulChecks + (patch.incrementSuccess ? 1 : 0);
  const consecutiveFailures = patch.resetFailures ? 0 : (patch.incrementFailure ? tracker.consecutiveFailures + 1 : tracker.consecutiveFailures);
  const reachedLimit = tracker.maximumChecks != null && attemptedChecks >= tracker.maximumChecks;
  const expired = now >= tracker.endsAt;
  const shouldPause = Boolean(patch.pause);
  const shouldComplete = reachedLimit || expired;

  const updates = {
    attemptedChecks,
    successfulChecks,
    consecutiveFailures,
    lastPolledAt: now,
    pollLeaseUntil: null,
    pollLeaseToken: null,
    nextPollAt: shouldPause || shouldComplete ? null : patch.nextPollAt
  };

  if (shouldComplete) {
    updates.status = 'COMPLETED';
    updates.completedAt = now;
  } else if (shouldPause) {
    updates.status = 'PAUSED';
  }

  await Tracker.updateOne({ _id: trackerId, pollLeaseToken: token }, { $set: updates });
}

export async function processClaimedTracker({ tracker, token }, now = new Date()) {
  const provider = getProvider(tracker.providerMode || env.BMS_PROVIDER);
  let result;
  try {
    result = await provider.collect(tracker);
  } catch (error) {
    result = { success: false, errorCode: 'COLLECTION_FAILED', errorMessage: error?.message || 'The collection failed.' };
  }

  if (result.success) {
    await storeProviderResult(tracker, result, now);
    const nextPollAt = getNextPollAt(now, tracker.pollingIntervalMinutes, tracker.clockAligned, tracker.timezone);
    await completeAfterAttempt(tracker._id, token, {
      incrementAttempt: true,
      incrementSuccess: true,
      resetFailures: true,
      nextPollAt
    }, now);
    return { success: true, trackerId: String(tracker._id) };
  }

  const failureCode = result.errorCode || 'COLLECTION_FAILED';
  const shouldPause = PAUSE_CODES.has(failureCode);
  const nextFailureCount = tracker.consecutiveFailures + 1;
  const mayRetry = RETRYABLE_CODES.has(failureCode) && nextFailureCount <= 2;
  const retryDelayMs = Math.min(60_000 * (2 ** tracker.consecutiveFailures), 5 * 60_000);
  const nextPollAt = mayRetry
    ? new Date(now.getTime() + retryDelayMs)
    : getNextPollAt(now, tracker.pollingIntervalMinutes, tracker.clockAligned, tracker.timezone);

  await storeFailedAttempt(tracker._id, result, now, mayRetry ? nextPollAt : null);
  await completeAfterAttempt(tracker._id, token, {
    incrementAttempt: true,
    incrementFailure: true,
    pause: shouldPause,
    nextPollAt
  }, now);
  return { success: false, errorCode: failureCode, trackerId: String(tracker._id) };
}

export async function runDuePollingBatch(batchSize = 5) {
  const results = [];
  await finishExpiredTrackers();
  for (let index = 0; index < batchSize; index += 1) {
    const claim = await claimDueTracker();
    if (!claim) break;
    results.push(await processClaimedTracker(claim));
  }
  return results;
}
