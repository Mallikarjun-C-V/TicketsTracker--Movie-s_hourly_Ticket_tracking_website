import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextPollAt, getRollingWindow, isTrackerLimitReached } from '../utils/timeWindows.js';

test('derives the estimated rolling one-hour window', () => {
  const observedAt = new Date('2026-11-07T15:30:00.000Z');
  const result = getRollingWindow(observedAt);
  assert.equal(result.windowStart.toISOString(), '2026-11-07T14:30:00.000Z');
  assert.equal(result.windowEnd.toISOString(), observedAt.toISOString());
  assert.equal(result.metricWindowMinutes, 60);
});

test('calculates a relative next poll and clock-aligned next poll', () => {
  const now = new Date('2026-11-07T10:03:00.000Z');
  assert.equal(getNextPollAt(now, 10).toISOString(), '2026-11-07T10:13:00.000Z');
  assert.equal(getNextPollAt(now, 10, true, 'UTC').toISOString(), '2026-11-07T10:10:00.000Z');
});

test('checks a configured maximum-attempt limit', () => {
  assert.equal(isTrackerLimitReached({ maximumChecks: 3, attemptedChecks: 3 }), true);
  assert.equal(isTrackerLimitReached({ maximumChecks: null, attemptedChecks: 50 }), false);
});
