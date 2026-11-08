import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBookMyShowUrl } from '../utils/urlSafety.js';

const hosts = ['in.bookmyshow.com'];

test('accepts an HTTPS URL on the configured BookMyShow host', () => {
  const result = validateBookMyShowUrl('https://in.bookmyshow.com/explore/movies', hosts);
  assert.equal(result, 'https://in.bookmyshow.com/explore/movies');
});

test('rejects unrelated domains and HTTP URLs', () => {
  assert.throws(() => validateBookMyShowUrl('https://example.com/movie', hosts), { code: 'UNAPPROVED_DOMAIN' });
  assert.throws(() => validateBookMyShowUrl('http://in.bookmyshow.com/movie', hosts), { code: 'UNAPPROVED_DOMAIN' });
  assert.throws(() => validateBookMyShowUrl('https://sub.in.bookmyshow.com/movie', hosts), { code: 'UNAPPROVED_DOMAIN' });
});

test('rejects credentials and IP literal destinations', () => {
  assert.throws(() => validateBookMyShowUrl('https://user:pass@in.bookmyshow.com/movie', hosts));
  assert.throws(() => validateBookMyShowUrl('https://127.0.0.1/movie', ['127.0.0.1']));
});
