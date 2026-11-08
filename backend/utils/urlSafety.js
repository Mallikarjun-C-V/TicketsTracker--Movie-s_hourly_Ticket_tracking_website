import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { AppError } from './errors.js';

export function validateBookMyShowUrl(rawUrl, allowedHosts = ['in.bookmyshow.com']) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError('Enter a valid BookMyShow URL.', 400, 'INVALID_URL');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const isApprovedHost = allowedHosts.includes(hostname);

  if (parsed.protocol !== 'https:' || !isApprovedHost || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw new AppError('Only HTTPS URLs on the configured BookMyShow domains are allowed.', 400, 'UNAPPROVED_DOMAIN');
  }
  if (net.isIP(hostname)) {
    throw new AppError('IP-address URLs are not accepted.', 400, 'IP_URL_NOT_ALLOWED');
  }
  parsed.hash = '';
  return parsed.toString();
}

function isPublicAddress(address) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

export async function assertPublicDestination(rawUrl, allowedHosts) {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const allowed = allowedHosts.includes(hostname);
  if (!allowed || parsed.protocol !== 'https:' || net.isIP(hostname) || (parsed.port && parsed.port !== '443')) {
    throw new AppError('The destination is outside the approved public BookMyShow host list.', 400, 'UNSAFE_DESTINATION');
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError('The approved host could not be resolved.', 502, 'DNS_LOOKUP_FAILED');
  }
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new AppError('The destination resolves to a restricted or non-public IP address.', 400, 'PRIVATE_DESTINATION_BLOCKED');
  }
  return true;
}
