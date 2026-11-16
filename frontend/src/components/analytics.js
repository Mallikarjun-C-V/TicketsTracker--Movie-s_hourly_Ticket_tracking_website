const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function safeTimeZone(timezone) {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: timezone || 'Asia/Kolkata' });
    return timezone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

export function sortSnapshotsNewestFirst(snapshots = []) {
  return [...snapshots].sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime());
}

export function sortSnapshotsOldestFirst(snapshots = []) {
  return [...snapshots].sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
}

/** Returns the UTC timestamp corresponding to the beginning of the local clock-hour. */
function getLocalHourStart(value, timezone) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

  const localTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundedTimestamp = Math.floor(timestamp / 1000) * 1000;
  const timezoneOffset = localTimeAsUtc - roundedTimestamp;
  return Date.UTC(year, month - 1, day, hour) - timezoneOffset;
}

export function buildHourlyBuckets(snapshots = [], timezone = 'Asia/Kolkata', pollingIntervalMinutes = 10, rangeStart = null, rangeEnd = null) {
  const datedSnapshots = snapshots
    .filter((snapshot) => Number.isFinite(new Date(snapshot.observedAt).getTime()))
    .map((snapshot) => ({
      snapshot,
      hourStart: getLocalHourStart(snapshot.observedAt, timezone)
    }))
    .filter((item) => item.hourStart !== null);

  if (!datedSnapshots.length) return [];

  const grouped = new Map();
  for (const item of datedSnapshots) {
    if (!grouped.has(item.hourStart)) {
      grouped.set(item.hourStart, { start: item.hourStart, recordCount: 0, validCount: 0, total: 0, values: [] });
    }
    const bucket = grouped.get(item.hourStart);
    bucket.recordCount += 1;
    const count = item.snapshot.ticketsSold;
    if (count !== null && count !== undefined && Number.isFinite(Number(count)) && Number(count) >= 0) {
      const numericCount = Number(count);
      bucket.validCount += 1;
      bucket.total += numericCount;
      bucket.values.push(numericCount);
    }
  }

  const interval = Number(pollingIntervalMinutes);
  const expectedReadings = Number.isFinite(interval) && interval > 0
    ? Math.max(1, Math.round(60 / interval))
    : 6;
  const starts = [...grouped.keys()].sort((a, b) => a - b);
  const requestedStart = rangeStart ? getLocalHourStart(rangeStart, timezone) : null;
  const requestedEndTime = rangeEnd ? new Date(rangeEnd).getTime() - 1 : null;
  const requestedEnd = Number.isFinite(requestedEndTime) ? getLocalHourStart(requestedEndTime, timezone) : null;
  const firstHour = requestedStart === null ? starts[0] : Math.min(starts[0], requestedStart);
  const lastHour = requestedEnd === null ? starts[starts.length - 1] : Math.max(starts[starts.length - 1], requestedEnd);
  const buckets = [];

  // Fill intervening clock-hours so missing collection periods are visible.
  // An empty bucket is marked as no data; it is not treated as verified zero sales.
  for (let hour = firstHour; hour <= lastHour; hour += HOUR_MS) {
    const existing = grouped.get(hour);
    const bucket = existing || { start: hour, recordCount: 0, validCount: 0, total: 0, values: [] };
    buckets.push({
      ...bucket,
      expectedReadings,
      average: bucket.validCount ? bucket.total / bucket.validCount : null,
      coverage: Math.min(100, (bucket.validCount / expectedReadings) * 100)
    });
  }

  return buckets;
}

/**
 * Computes failed collection attempts since the previous successful collection,
 * then matches each successful attempt to its nearest snapshot timestamp.
 * The API currently exposes only the latest 100 attempts, so the first success
 * in a capped result is deliberately marked as a lower bound / unknown boundary.
 */
export function mapFailedAttemptsToSnapshots(attempts = [], snapshots = []) {
  const chronologicalAttempts = [...attempts].sort(
    (a, b) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime()
  );
  const historyMayBeTruncated = chronologicalAttempts.length >= 100;
  let pendingFailures = 0;
  let hasSeenSuccess = false;
  const successfulAttempts = [];

  for (const attempt of chronologicalAttempts) {
    if (attempt.status === 'FAILED') {
      pendingFailures += 1;
      continue;
    }
    if (attempt.status === 'SUCCESS' || attempt.status === 'NEEDS_REVIEW') {
      successfulAttempts.push({
        attemptedAt: new Date(attempt.attemptedAt).getTime(),
        failedCount: pendingFailures,
        boundaryUnknown: historyMayBeTruncated && !hasSeenSuccess,
        status: attempt.status
      });
      pendingFailures = 0;
      hasSeenSuccess = true;
    }
  }

  const usedAttempts = new Set();
  const result = new Map();
  const matchToleranceMs = 3 * MINUTE_MS;

  for (const snapshot of snapshots) {
    const observedAt = new Date(snapshot.observedAt).getTime();
    if (!Number.isFinite(observedAt)) continue;

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    successfulAttempts.forEach((attempt, index) => {
      if (usedAttempts.has(index)) return;
      const distance = Math.abs(attempt.attemptedAt - observedAt);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex !== -1 && bestDistance <= matchToleranceMs) {
      usedAttempts.add(bestIndex);
      const match = successfulAttempts[bestIndex];
      result.set(snapshot._id || `${observedAt}`, {
        failedCount: match.failedCount,
        boundaryUnknown: match.boundaryUnknown,
        attemptStatus: match.status
      });
    }
  }

  return { bySnapshotId: result, historyMayBeTruncated };
}

export function buildIntervalChanges(snapshots = [], pollingIntervalMinutes = 10) {
  const chronological = sortSnapshotsOldestFirst(snapshots).filter((snapshot) =>
    snapshot.ticketsSold !== null &&
    snapshot.ticketsSold !== undefined &&
    Number.isFinite(Number(snapshot.ticketsSold)) &&
    Number.isFinite(new Date(snapshot.observedAt).getTime())
  );
  const expectedMinutes = Number.isFinite(Number(pollingIntervalMinutes)) && Number(pollingIntervalMinutes) > 0
    ? Number(pollingIntervalMinutes)
    : 10;

  return chronological.slice(1).map((current, index) => {
    const previous = chronological[index];
    const elapsedMinutes = (new Date(current.observedAt).getTime() - new Date(previous.observedAt).getTime()) / MINUTE_MS;
    const delta = Number(current.ticketsSold) - Number(previous.ticketsSold);
    const expectedMin = Math.max(1, expectedMinutes * 0.6);
    const expectedMax = expectedMinutes * 1.5;
    const intervalType = elapsedMinutes > expectedMax
      ? 'gap'
      : elapsedMinutes < expectedMin
        ? 'short'
        : 'normal';

    return {
      id: current._id || `${current.observedAt}-${index}`,
      from: previous.observedAt,
      to: current.observedAt,
      fromCount: Number(previous.ticketsSold),
      toCount: Number(current.ticketsSold),
      elapsedMinutes,
      delta,
      intervalType
    };
  }).reverse();
}
