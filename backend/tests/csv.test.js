import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../utils/csv.js';

test('CSV output escapes commas, quotes and line breaks', () => {
  const csv = toCsv([
    ['Movie label', 'Raw text'],
    ['A Film', '"2,350 tickets sold", last hour']
  ]);
  assert.equal(csv, '"Movie label","Raw text"\r\n"A Film","""2,350 tickets sold"", last hour"');
});

test('CSV output preserves null values as empty cells', () => {
  assert.equal(toCsv([['count', null]]), '"count",""');
});
