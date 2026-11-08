import Tracker from '../models/Tracker.js';
import TicketSnapshot from '../models/TicketSnapshot.js';
import PollAttempt from '../models/PollAttempt.js';
import { env } from '../config/env.js';
import { validateBookMyShowUrl } from '../utils/urlSafety.js';
import { AppError } from '../utils/errors.js';
import { isTrackerLimitReached } from '../utils/timeWindows.js';
import { storeManualObservation } from './observationService.js';
import { toCsv } from '../utils/csv.js';

export async function createTracker(input) {
  const bookMyShowUrl = validateBookMyShowUrl(input.bookMyShowUrl, env.BMS_ALLOWED_HOSTS);
  const now = new Date();
  const providerMode = env.BMS_PROVIDER;
  const endsAt = new Date(now.getTime() + input.durationMinutes * 60_000);
  const tracker = await Tracker.create({
    movieLabel: input.movieLabel || '',
    bookMyShowUrl,
    pollingIntervalMinutes: input.pollingIntervalMinutes,
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
    maximumChecks: input.maximumChecks ?? null,
    providerMode,
    clockAligned: Boolean(input.clockAligned),
    status: 'RUNNING',
    startedAt: now,
    endsAt,
    nextPollAt: providerMode === 'manual' ? null : now
  });
  return tracker;
}

export async function getTrackerOrThrow(id) {
  const tracker = await Tracker.findById(id);
  if (!tracker) throw new AppError('Tracking session not found.', 404, 'TRACKER_NOT_FOUND');
  return tracker;
}

export async function listTrackers(limit = 50) {
  const trackers = await Tracker.find().sort({ createdAt: -1 }).limit(limit).lean();
  return trackers;
}

export async function getSnapshots(id) {
  return TicketSnapshot.find({ trackerId: id }).sort({ observedAt: 1 }).lean();
}

export async function getAttempts(id) {
  return PollAttempt.find({ trackerId: id }).sort({ attemptedAt: -1 }).limit(100).lean();
}

export async function setTrackerStatus(id, action) {
  const tracker = await getTrackerOrThrow(id);
  const now = new Date();
  if (action === 'pause') {
    if (tracker.status !== 'RUNNING') throw new AppError('Only a running tracker can be paused.', 409, 'INVALID_TRACKER_STATE');
    tracker.status = 'PAUSED';
    tracker.nextPollAt = null;
    tracker.pollLeaseUntil = null;
    tracker.pollLeaseToken = null;
  } else if (action === 'resume') {
    if (tracker.status !== 'PAUSED') throw new AppError('Only a paused tracker can be resumed.', 409, 'INVALID_TRACKER_STATE');
    if (now >= tracker.endsAt || isTrackerLimitReached(tracker)) {
      tracker.status = 'COMPLETED';
      tracker.completedAt = now;
      tracker.nextPollAt = null;
    } else {
      tracker.status = 'RUNNING';
      tracker.nextPollAt = tracker.providerMode === 'manual' ? null : now;
    }
  } else if (action === 'stop') {
    if (['STOPPED', 'COMPLETED'].includes(tracker.status)) throw new AppError('This tracker has already stopped.', 409, 'INVALID_TRACKER_STATE');
    tracker.status = 'STOPPED';
    tracker.completedAt = now;
    tracker.nextPollAt = null;
    tracker.pollLeaseUntil = null;
    tracker.pollLeaseToken = null;
  }
  await tracker.save();
  return tracker;
}

export async function addManualObservation(id, input) {
  const tracker = await getTrackerOrThrow(id);
  if (tracker.providerMode !== 'manual') {
    throw new AppError('Manual readings are available when BMS_PROVIDER=manual.', 409, 'MANUAL_PROVIDER_NOT_ACTIVE');
  }
  if (!['RUNNING', 'PAUSED'].includes(tracker.status)) {
    throw new AppError('Manual readings can only be added to an active or paused tracker.', 409, 'INVALID_TRACKER_STATE');
  }
  if (new Date() > tracker.endsAt) throw new AppError('This tracking period has expired.', 409, 'TRACKER_EXPIRED');

  const snapshot = await storeManualObservation(tracker, input);
  tracker.attemptedChecks += 1;
  tracker.successfulChecks += 1;
  tracker.lastPolledAt = snapshot.observedAt;
  if (isTrackerLimitReached(tracker)) {
    tracker.status = 'COMPLETED';
    tracker.completedAt = new Date();
    tracker.nextPollAt = null;
  }
  await tracker.save();
  return snapshot;
}

export async function deleteTracker(id) {
  const tracker = await getTrackerOrThrow(id);
  await Promise.all([
    TicketSnapshot.deleteMany({ trackerId: id }),
    PollAttempt.deleteMany({ trackerId: id })
  ]);
  await tracker.deleteOne();
}

export async function exportTrackerCsv(id) {
  const tracker = await getTrackerOrThrow(id);
  const snapshots = await getSnapshots(id);
  const headers = ['Movie label', 'Original URL', 'Observation number', 'Observation timestamp', 'Estimated period start', 'Estimated period end', 'Ticket count', 'Raw displayed text', 'Precision status'];
  const rows = snapshots.map((item, index) => [
    tracker.movieLabel,
    tracker.bookMyShowUrl,
    index + 1,
    item.observedAt.toISOString(),
    item.windowStart.toISOString(),
    item.windowEnd.toISOString(),
    item.ticketsSold ?? '',
    item.rawDisplayedText,
    item.precision
  ]);
  return toCsv([headers, ...rows]);
}
