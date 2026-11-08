import { env } from '../config/env.js';
import { MockProvider } from './mockProvider.js';
import { ManualProvider } from './manualProvider.js';
import { AuthorizedBookMyShowProvider } from './bookmyshowScraper.js';

const providers = {
  mock: new MockProvider(),
  manual: new ManualProvider(),
  live: new AuthorizedBookMyShowProvider()
};

export function getProvider(mode = env.BMS_PROVIDER) {
  return providers[mode] || providers.mock;
}
