import { createHash } from 'node:crypto';

export class MockProvider {
  async collect(tracker) {
    const seed = Number.parseInt(createHash('sha256').update(String(tracker._id)).digest('hex').slice(0, 6), 16) % 2400 + 650;
    const ticketsSold = seed + tracker.attemptedChecks * 137;
    return {
      success: true,
      ticketsSold,
      rawDisplayedText: `${ticketsSold.toLocaleString('en-IN')} tickets sold in the last 1 hour (mock sample)`,
      precision: 'EXACT',
      metricWindowMinutes: 60,
      observedAt: new Date(),
      sourceProvider: 'MOCK'
    };
  }
}
