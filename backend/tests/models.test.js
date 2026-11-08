import test from 'node:test';
import assert from 'node:assert/strict';
import Tracker from '../models/Tracker.js';
import TicketSnapshot from '../models/TicketSnapshot.js';
import PollAttempt from '../models/PollAttempt.js';

const now = new Date('2026-11-07T10:00:00.000Z');

test('tracker model validates the required tracking configuration', async () => {
  const tracker = new Tracker({
    movieLabel: 'Sample title',
    bookMyShowUrl: 'https://in.bookmyshow.com/movie/sample',
    pollingIntervalMinutes: 10,
    durationMinutes: 300,
    timezone: 'Asia/Kolkata',
    status: 'RUNNING',
    startedAt: now,
    endsAt: new Date(now.getTime() + 300 * 60_000),
    nextPollAt: now
  });
  await tracker.validate();
  tracker.status = 'UNKNOWN';
  await assert.rejects(() => tracker.validate());
});

test('snapshot model requires the rolling window and explicit precision/source', async () => {
  const snapshot = new TicketSnapshot({
    trackerId: new Tracker()._id,
    observedAt: now,
    windowStart: new Date(now.getTime() - 60 * 60_000),
    windowEnd: now,
    metricWindowMinutes: 60,
    ticketsSold: 12300,
    rawDisplayedText: '12.3K tickets sold in the last 1 hour',
    precision: 'APPROXIMATE',
    sourceProvider: 'MOCK'
  });
  await snapshot.validate();
});

test('poll attempt supports a separate failed status', async () => {
  const attempt = new PollAttempt({ trackerId: new Tracker()._id, attemptedAt: now, status: 'FAILED', errorCode: 'TIMEOUT' });
  await attempt.validate();
  attempt.status = 'NOT_A_STATUS';
  await assert.rejects(() => attempt.validate());
});
