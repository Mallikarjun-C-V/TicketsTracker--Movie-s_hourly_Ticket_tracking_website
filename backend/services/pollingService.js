
export async function processClaimedTracker({ tracker, token }, now = new Date()) {
  const provider = getProvider(tracker.providerMode || env.BMS_PROVIDER);

  const pollStartedAt = Date.now();

  console.log('\n[POLL-DIAGNOSTICS] =================================');
  console.log('[POLL-DIAGNOSTICS] TRACKER POLLING STARTED');

  console.log('[POLL-DIAGNOSTICS] Tracker information:', {
    trackerId: String(tracker._id),
    movie: tracker.movieLabel,
    providerMode: tracker.providerMode,
    pollingIntervalMinutes: tracker.pollingIntervalMinutes,
    attemptedChecks: tracker.attemptedChecks,
    successfulChecks: tracker.successfulChecks,
    consecutiveFailures: tracker.consecutiveFailures,
    maximumChecks: tracker.maximumChecks,
    nextPollAt: tracker.nextPollAt,
    endsAt: tracker.endsAt,
    timezone: tracker.timezone,
    currentTime: now.toISOString()
  });

  let result;

  try {
    console.log('[POLL-DIAGNOSTICS] Calling provider.collect()');

    result = await provider.collect(tracker);

    console.log('[POLL-DIAGNOSTICS] Provider response received:', {
      success: result?.success,
      errorCode: result?.errorCode,
      errorMessage: result?.errorMessage,
      ticketsSold: result?.ticketsSold,
      precision: result?.precision,
      sourceProvider: result?.sourceProvider,
      durationMs: Date.now() - pollStartedAt
    });

  } catch (error) {
    console.error('[POLL-DIAGNOSTICS] PROVIDER THREW AN EXCEPTION:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      durationMs: Date.now() - pollStartedAt
    });

    result = {
      success: false,
      errorCode: 'COLLECTION_FAILED',
      errorMessage: error?.message || 'The collection failed.'
    };
  }

  // SUCCESS

  if (result.success) {

    console.log('[POLL-DIAGNOSTICS] COLLECTION SUCCESSFUL');

    try {
      console.log('[POLL-DIAGNOSTICS] Saving successful observation');

      await storeProviderResult(tracker, result, now);

      console.log('[POLL-DIAGNOSTICS] Observation saved successfully');

      const nextPollAt = getNextPollAt(
        now,
        tracker.pollingIntervalMinutes,
        tracker.clockAligned,
        tracker.timezone
      );

      await completeAfterAttempt(tracker._id, token, {
        incrementAttempt: true,
        incrementSuccess: true,
        resetFailures: true,
        nextPollAt
      }, now);

      console.log('[POLL-DIAGNOSTICS] SUCCESS SUMMARY:', {
        trackerId: String(tracker._id),
        ticketsSold: result.ticketsSold,
        nextPollAt,
        totalDurationMs: Date.now() - pollStartedAt
      });

      return {
        success: true,
        trackerId: String(tracker._id)
      };

    } catch (error) {
      console.error('[POLL-DIAGNOSTICS] SUCCESS RESULT COULD NOT BE SAVED:', {
        message: error?.message,
        stack: error?.stack,
        trackerId: String(tracker._id)
      });

      throw error;
    }
  }

  // FAILURE

  const failureCode = result.errorCode || 'COLLECTION_FAILED';

  const shouldPause = PAUSE_CODES.has(failureCode);

  const nextFailureCount = tracker.consecutiveFailures + 1;

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

  console.error('[POLL-DIAGNOSTICS] COLLECTION FAILED:', {
    trackerId: String(tracker._id),
    movie: tracker.movieLabel,
    errorCode: failureCode,
    errorMessage: result.errorMessage,
    shouldPause,
    mayRetry,
    retryDelayMs,
    previousConsecutiveFailures: tracker.consecutiveFailures,
    nextFailureCount,
    nextPollAt,
    totalDurationMs: Date.now() - pollStartedAt
  });

  try {
    console.log('[POLL-DIAGNOSTICS] Saving failed attempt');

    await storeFailedAttempt(
      tracker._id,
      result,
      now,
      mayRetry ? nextPollAt : null
    );

    console.log('[POLL-DIAGNOSTICS] Failed attempt saved');

    await completeAfterAttempt(tracker._id, token, {
      incrementAttempt: true,
      incrementFailure: true,
      pause: shouldPause,
      nextPollAt
    }, now);

    console.log('[POLL-DIAGNOSTICS] Failure processing completed');

  } catch (error) {
    console.error('[POLL-DIAGNOSTICS] FAILED TO SAVE OR UPDATE FAILED ATTEMPT:', {
      message: error?.message,
      stack: error?.stack,
      trackerId: String(tracker._id)
    });

    throw error;
  }

  console.log('[POLL-DIAGNOSTICS] =================================\n');

  return {
    success: false,
    errorCode: failureCode,
    trackerId: String(tracker._id)
  };
}
