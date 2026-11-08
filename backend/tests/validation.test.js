import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerSchema, manualObservationSchema } from '../utils/validation.js';

test('accepts valid tracker settings and rejects a polling interval below the configured minimum', () => {
  const valid = createTrackerSchema.safeParse({
    bookMyShowUrl: 'https://in.bookmyshow.com/explore/movies',
    movieLabel: 'Sample Film',
    pollingIntervalMinutes: 10,
    durationMinutes: 300,
    maximumChecks: 20,
    timezone: 'Asia/Kolkata'
  });
  assert.equal(valid.success, true);

  const invalid = createTrackerSchema.safeParse({
    bookMyShowUrl: 'https://in.bookmyshow.com/explore/movies',
    pollingIntervalMinutes: 5,
    durationMinutes: 60,
    timezone: 'Asia/Kolkata'
  });
  assert.equal(invalid.success, false);
});

test('validates manual observations', () => {
  assert.equal(manualObservationSchema.safeParse({ ticketsSold: 1250, precision: 'EXACT' }).success, true);
  assert.equal(manualObservationSchema.safeParse({ ticketsSold: -1 }).success, false);
});
