import test from 'node:test';
import assert from 'node:assert/strict';
import { MockProvider } from '../scraper/mockProvider.js';
import { ManualProvider } from '../scraper/manualProvider.js';

test('mock provider returns deterministic sample observations with explicit provenance', async () => {
  const provider = new MockProvider();
  const tracker = { _id: 'tracker-test-1', attemptedChecks: 0 };
  const first = await provider.collect(tracker);
  const repeated = await provider.collect(tracker);
  assert.equal(first.success, true);
  assert.equal(first.ticketsSold, repeated.ticketsSold);
  assert.equal(first.sourceProvider, 'MOCK');
  assert.match(first.rawDisplayedText, /mock sample/i);
  assert.equal(first.metricWindowMinutes, 60);
});

test('manual provider never invents an observation', async () => {
  const result = await new ManualProvider().collect({});
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'MANUAL_INPUT_REQUIRED');
});
