import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTicketCount } from '../utils/numberParser.js';

test('parses an exact previous-one-hour count', () => {
  const result = parseTicketCount('2,350 tickets sold in the last 1 hour');
  assert.equal(result.matched, true);
  assert.equal(result.ticketsSold, 2350);
  assert.equal(result.precision, 'EXACT');
  assert.equal(result.metricWindowMinutes, 60);
});

test('normalizes K and lakh as approximate values', () => {
  assert.deepEqual(
    (({ ticketsSold, precision }) => ({ ticketsSold, precision }))(parseTicketCount('12.3K tickets sold in the last 1 hour')),
    { ticketsSold: 12300, precision: 'APPROXIMATE' }
  );
  assert.deepEqual(
    (({ ticketsSold, precision }) => ({ ticketsSold, precision }))(parseTicketCount('1.2 lakh tickets booked in the last 1 hour')),
    { ticketsSold: 120000, precision: 'APPROXIMATE' }
  );
});

test('does not parse a value without verified previous-hour ticket wording', () => {
  const result = parseTicketCount('2,350 tickets sold today');
  assert.equal(result.matched, false);
  assert.equal(result.ticketsSold, null);
});

test('preserves matched source text when it cannot safely find a number', () => {
  const result = parseTicketCount('Tickets sold in the last 1 hour: not available');
  assert.equal(result.matched, true);
  assert.equal(result.ticketsSold, null);
  assert.equal(result.precision, 'REVIEW');
});


test('parses the BookMyShow counter span when its parent supplies the previous-hour label', () => {
  const result = parseTicketCount('66.45K', '', '66.45K tickets sold in the previous 1 hour');
  assert.equal(result.matched, true);
  assert.equal(result.ticketsSold, 66450);
  assert.equal(result.rawDisplayedText, '66.45K');
  assert.equal(result.precision, 'APPROXIMATE');
  assert.equal(result.metricWindowMinutes, 60);
});

test('does not accept the counter span when its surrounding context does not confirm ticket sales', () => {
  const result = parseTicketCount('66.45K', '', '66.45K views in the previous 1 hour');
  assert.equal(result.matched, false);
  assert.equal(result.ticketsSold, null);
});
