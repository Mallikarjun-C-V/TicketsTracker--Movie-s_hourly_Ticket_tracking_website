
import { randomUUID } from 'node:crypto';
import Tracker from '../models/Tracker.js';
import { env } from '../config/env.js';
import { getProvider } from '../scraper/providerFactory.js';
import {
  storeFailedAttempt,
  storeProviderResult
} from './observationService.js';
import {
  getNextPollAt,
  isTrackerLimitReached
} from '../utils/timeWindows.js';

const LOG = '[POLL-DIAGNOSTICS]';

const LEASE_MS = 120_000;

const RETRYABLE_CODES = new Set([
  'PAGE_TIMEOUT',
  'LIVE_COLLECTION_FAILED',
  'BROWSER_LAUNCH_FAILED',
  'DNS_LOOKUP_FAILED'
]);

const PAUSE_CODES = new Set([
  'CAPTCHA_DETECTED',
  'ACCESS_DENIED',
  'LIVE_PROVIDER_DISABLED',
  'UNSAFE_DESTINATION',
  'PRIVATE_DESTINATION_BLOCKED'
]);

export async function finishExpiredTrackers(now = new Date()) {
  console.log(`${LOG} Checking expired trackers...`);

  await Tracker.updateMany(
    { status: 'RUNNING', endsAt: { $lte: now } },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: now,
        nextPollAt: null,
        pollLeaseUntil: null,
        pollLeaseToken: null
      }
    }
  );

  await Tracker.updateMany(
    {
      status: 'RUNNING',
      maximumChecks: { $ne: null },
      $expr: { $gte: ['$attemptedChecks', '$maximumChecks'] }
    },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: now,
        nextPollAt: null,
        pollLeaseUntil: null,
        pollLeaseToken: null
      }
    }
  );

  console.log(`${LOG} Expired tracker check completed`);
}

async function claimDueTracker(now = new Date()) {
  const token = randomUUID();

  const tracker = await Tracker.findOneAndUpdate(
    {
      status: 'RUNNING',
      providerMode: { $ne: 'manual' },
      nextPollAt: { $lte: now },
      endsAt: { $gt: now },
      $or: [
        { maximumChecks: null },
        {
          $expr: {
            $lt: ['$attemptedChecks', '$maximumChecks']
          }
        }
      ],
      $and: [
        {
          $or: [
            { pollLeaseUntil: null },
            { pollLeaseUntil: { $lte: now } }
          ]
        }
      ]
    },
    {
      $set: {
        pollLeaseUntil: new Date(now.getTime() + LEASE_MS),
        pollLeaseToken: token
      }
    },
    {
      new: true,
      sort: { nextPollAt: 1 }
    }
  );

  if (!tracker) {
    return null;
  }

  console.log(`${LOG} Tracker claimed:`, {
    trackerId: String(tracker._id),
    movie: tracker.movieLabel,
    providerMode: tracker.providerMode,
    nextPollAt: tracker.nextPollAt,
    leaseUntil: tracker.pollLeaseUntil
  });

  return { tracker, token };
}

async function completeAfterAttempt(
  trackerId,
  token,
  patch,
  now
) {
  console.log(`${LOG} Updating tracker after collection`, {
    trackerId: String(trackerId),
    patch
  });

  const tracker = await Tracker.findById(trackerId);

  if (!tracker || tracker.pollLeaseToken !== token) {
    console.warn(`${LOG} Tracker lease mismatch or tracker missing`, {
      trackerId: String(trackerId),
      trackerFound: Boolean(tracker)
    });

    return;
  }

  const attemptedChecks =
    tracker.attemptedChecks + (patch.incrementAttempt ? 1 : 0);

  const successfulChecks =
    tracker.successfulChecks + (patch.incrementSuccess ? 1 : 0);

  const consecutiveFailures = patch.resetFailures
    ? 0
    : (
        patch.incrementFailure
          ? tracker.consecutiveFailures + 1
          : tracker.consecutiveFailures
      );

  const reachedLimit =
    tracker.maximumChecks != null &&
    attemptedChecks >= tracker.maximumChecks;

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
    nextPollAt:
      shouldPause || shouldComplete ? null : patch.nextPollAt
  };

  if (shouldComplete) {
    updates.status = 'COMPLETED';
    updates.completedAt = now;
  } else if (shouldPause) {
    updates.status = 'PAUSED';
  }

  const updateResult = await Tracker.updateOne(
    { _id: trackerId, pollLeaseToken: token },
    { $set: updates }
  );

  console.log(`${LOG} Tracker update result:`, {
    trackerId: String(trackerId),
    modifiedCount: updateResult.modifiedCount,
    ...updates
  });
}

export async function processClaimedTracker(
  { tracker, token },
  now = new Date()
) {
  const startedAt = Date.now();

  console.log('\n========================================');
  console.log(`${LOG} COLLECTION ATTEMPT STARTED`);
  console.log(`${LOG} Tracker:`, {
    trackerId: String(tracker._id),
    movie: tracker.movieLabel,
    providerMode: tracker.providerMode,
    attemptedChecks: tracker.attemptedChecks,
    successfulChecks: tracker.successfulChecks,
    consecutiveFailures: tracker.consecutiveFailures,
    nextPollAt: tracker.nextPollAt,
    timezone: tracker.timezone
  });

  let result;

  try {
    const provider = getProvider(
      tracker.providerMode || env.BMS_PROVIDER
    );

    console.log(`${LOG} Provider selected. Starting collection...`);

    result = await provider.collect(tracker);

    console.log(`${LOG} Provider response:`, {
      success: result?.success,
      errorCode: result?.errorCode,
      errorMessage: result?.errorMessage,
      ticketsSold: result?.ticketsSold,
      precision: result?.precision
    });

  } catch (error) {
    console.error(`${LOG} PROVIDER EXCEPTION:`, {
      message: error?.message,
      stack: error?.stack,
      code: error?.code
    });

    result = {
      success: false,
      errorCode: 'COLLECTION_FAILED',
      errorMessage: error?.message || 'The collection failed.'
    };
  }

  // SUCCESS

  if (result?.success) {
    try {
      console.log(`${LOG} Collection successful. Saving observation...`);

      await storeProviderResult(tracker, result, now);

      console.log(`${LOG} Observation saved successfully`);

      const nextPollAt = getNextPollAt(
        now,
        tracker.pollingIntervalMinutes,
        tracker.clockAligned,
        tracker.timezone
      );

      await completeAfterAttempt(
        tracker._id,
        token,
        {
          incrementAttempt: true,
          incrementSuccess: true,
          resetFailures: true,
          nextPollAt
        },
        now
      );

      console.log(`${LOG} SUCCESS SUMMARY:`, {
        trackerId: String(tracker._id),
        ticketsSold: result.ticketsSold,
        nextPollAt,
        durationMs: Date.now() - startedAt
      });

      return {
        success: true,
        trackerId: String(tracker._id)
      };

    } catch (error) {
      console.error(`${LOG} SUCCESS STORAGE ERROR:`, {
        message: error?.message,
        stack: error?.stack,
        trackerId: String(tracker._id)
      });

      throw error;
    }
  }

  // FAILURE

  const failureCode =
    result?.errorCode || 'COLLECTION_FAILED';

  const shouldPause = PAUSE_CODES.has(failureCode);

  const nextFailureCount =
    tracker.consecutiveFailures + 1;

  const mayRetry =
    RETRYABLE_CODES.has(failureCode) &&
    nextFailureCount <= 2;

  const retryDelayMs = Math.min(
    60_000 * (2 ** tracker.consecutiveFailures),
    5 * 60_000
  );

  const nextPollAt = mayRetry
    ? new Date(now.getTime() + retryDelayMs)
    : getNextPollAt(
        now,
        tracker.pollingIntervalMinutes,
        tracker.clockAligned,
        tracker.timezone
      );

  console.error(`${LOG} COLLECTION FAILED:`, {
    trackerId: String(tracker._id),
    movie: tracker.movieLabel,
    errorCode: failureCode,
    errorMessage: result?.errorMessage,
    shouldPause,
    mayRetry,
    retryDelayMs,
    previousFailures: tracker.consecutiveFailures,
    nextFailureCount,
    nextPollAt,
    durationMs: Date.now() - startedAt
  });

  try {
    await storeFailedAttempt(
      tracker._id,
      result,
      now,
      mayRetry ? nextPollAt : null
    );

    console.log(`${LOG} Failed attempt saved`);

    await completeAfterAttempt(
      tracker._id,
      token,
      {
        incrementAttempt: true,
        incrementFailure: true,
        pause: shouldPause,
        nextPollAt
      },
      now
    );

    console.log(`${LOG} Failure processing completed`);

  } catch (error) {
    console.error(`${LOG} FAILURE STORAGE ERROR:`, {
      message: error?.message,
      stack: error?.stack,
      trackerId: String(tracker._id)
    });

    throw error;
  }

  console.log(`${LOG} COLLECTION ATTEMPT FINISHED`);
  console.log('========================================\n');

  return {
    success: false,
    errorCode: failureCode,
    trackerId: String(tracker._id)
  };
}

// IMPORTANT: The scheduler requires this named export.

export async function runDuePollingBatch(batchSize = 5) {
  console.log(`\n${LOG} SCHEDULER BATCH STARTED`, {
    batchSize,
    time: new Date().toISOString()
  });

  const results = [];

  await finishExpiredTrackers();

  for (let index = 0; index < batchSize; index += 1) {
    console.log(`${LOG} Checking batch slot ${index + 1}/${batchSize}`);

    const claim = await claimDueTracker();

    if (!claim) {
      console.log(`${LOG} No more trackers are due for collection`);
      break;
    }

    const result = await processClaimedTracker(claim);

    results.push(result);
  }

  console.log(`${LOG} SCHEDULER BATCH FINISHED`, {
    totalProcessed: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length
  });

  return results;
}
