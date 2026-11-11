import { chromium } from 'playwright';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { assertPublicDestination, validateBookMyShowUrl } from '../utils/urlSafety.js';
import { parseTicketCount } from '../utils/numberParser.js';

const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

export class AuthorizedBookMyShowProvider {
  async collect(tracker) {
    if (!env.LIVE_PROVIDER_READY) {
      return {
        success: false,
        errorCode: 'LIVE_PROVIDER_DISABLED',
        errorMessage: 'Live collection is disabled. Configure the provider and confirm authorized access before enabling it.'
      };
    }

    let browser;
    let context;
    try {
      const targetUrl = validateBookMyShowUrl(tracker.bookMyShowUrl, env.BMS_ALLOWED_HOSTS);
      await assertPublicDestination(targetUrl, env.BMS_ALLOWED_HOSTS);

      browser = await chromium.launch({ headless: env.BROWSER_HEADLESS });
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: MOBILE_USER_AGENT,
        locale: 'en-IN',
        timezoneId: tracker.timezone
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      page.setDefaultNavigationTimeout(env.BROWSER_NAVIGATION_TIMEOUT_MS);

      // The page document itself must be on an approved host (checked with DNS/SSRF rules).
      // Sub-resources (JS bundles, CSS, API calls) come from BookMyShow-owned
      // CDN/API domains, so they are allowed by suffix. Everything else is blocked.
      const RESOURCE_SUFFIXES = ['bookmyshow.com', 'bmscdn.com'];
      await page.route('**/*', async (route) => {
        const request = route.request();
        try {
          const url = new URL(request.url());
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            await assertPublicDestination(request.url(), env.BMS_ALLOWED_HOSTS);
            return await route.continue();
          }
          const host = url.hostname.toLowerCase();
          const ok = url.protocol === 'https:' &&
            RESOURCE_SUFFIXES.some((suffix) => host === suffix || host.endsWith('.' + suffix));
          if (!ok) return await route.abort('blockedbyclient');
          return await route.continue();
        } catch {
          await route.abort('blockedbyclient').catch(() => {});
        }
      });

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: env.BROWSER_NAVIGATION_TIMEOUT_MS });
      // The "tickets booked in last 1 hour" badge is rendered by JavaScript after load,
      // so wait for it instead of sleeping a fixed time.
      await page.getByText(/(?:last|past|previous)\s*(?:1|one)\s*(?:hour|hr)/i).first()
        .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
      const bodyText = await page.locator('body').innerText().catch(() => '');

      if (/verify (?:that )?you are human|captcha|unusual traffic/i.test(bodyText)) {
        return { success: false, errorCode: 'CAPTCHA_DETECTED', errorMessage: 'The page presented a human-verification challenge. Live tracking has been paused; no challenge was bypassed.' };
      }
      if (/access denied|temporarily blocked|request blocked/i.test(bodyText)) {
        return { success: false, errorCode: 'ACCESS_DENIED', errorMessage: 'BookMyShow denied access to the page. Live tracking will be paused.' };
      }

      const selector = env.BMS_COUNTER_SELECTOR || '.sc-1qdowf4-0.iGNlkn';
      const counterLocator = page.locator(selector);
      const counterCount = Math.min(await counterLocator.count(), 10);

      // The provided BookMyShow counter markup is a span whose visible value
      // is abbreviated (for example, "66.45K"). Its parent/ancestor carries
      // the surrounding "previous 1 hour" and ticket-sales wording.
      for (let index = 0; index < counterCount; index += 1) {
        const target = counterLocator.nth(index);
        const nodeData = await target.evaluate((element) => {
          const valueText = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
          const ancestorTexts = [];
          let ancestor = element.parentElement;
          for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
            const text = (ancestor.innerText || ancestor.textContent || '').replace(/\s+/g, ' ').trim();
            if (text && text.length <= 1200) ancestorTexts.push(text);
          }
          return { valueText, ancestorTexts };
        }).catch(() => ({ valueText: '', ancestorTexts: [] }));

        if (!nodeData.valueText) continue;
        const verifiedContext = nodeData.ancestorTexts.find((text) =>
          /(?:\b(?:last|past|previous)\s*(?:one|1)\s*(?:hour|hours|hr|hrs)\b|\b(?:last|past|previous)\s*60\s*minutes?\b)/i.test(text) &&
          /\b(?:tickets?|bookings?|booked|sold|purchased)\b/i.test(text)
        );
        if (!verifiedContext) continue;

        const parsed = parseTicketCount(nodeData.valueText, env.BMS_COUNTER_REGEX, verifiedContext);
        if (parsed.matched && parsed.ticketsSold !== null) {
          return {
            success: true,
            ticketsSold: parsed.ticketsSold,
            rawDisplayedText: parsed.rawDisplayedText,
            precision: parsed.precision,
            metricWindowMinutes: 60,
            observedAt: new Date(),
            sourceProvider: 'BOOKMYSHOW'
          };
        }
      }

      // Fallback for a page version where the full metric is rendered as one
      // text line rather than in the configured counter span.
      for (const line of bodyText.split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
        const parsed = parseTicketCount(line, env.BMS_COUNTER_REGEX);
        if (parsed.matched && parsed.ticketsSold !== null) {
          return {
            success: true,
            ticketsSold: parsed.ticketsSold,
            rawDisplayedText: parsed.rawDisplayedText,
            precision: parsed.precision,
            metricWindowMinutes: 60,
            observedAt: new Date(),
            sourceProvider: 'BOOKMYSHOW'
          };
        }
      }

      console.warn('[bms] metric not found. title=%j url=%s bodyStart=%j', await page.title().catch(() => ''), page.url(), bodyText.slice(0, 300));
      return {
        success: false,
        errorCode: 'TARGET_METRIC_NOT_FOUND',
        errorMessage: 'The previous-one-hour ticket-sales wording was not found. Verify the authorized page structure and configured selector; no number was inferred.'
      };
    } catch (error) {
      if (error instanceof AppError) {
        return { success: false, errorCode: error.code, errorMessage: error.message };
      }
      const message = error?.message || 'The authorized page could not be collected.';
      console.error('[bms] collect failed:', error);
      const isTimeout = /timeout/i.test(message);
      return {
        success: false,
        errorCode: isTimeout ? 'PAGE_TIMEOUT' : 'LIVE_COLLECTION_FAILED',
        errorMessage: isTimeout ? 'The page did not respond within the configured time limit.' : 'The authorized page could not be collected. Check the URL and network access.'
      };
    } finally {
      await context?.close().catch(() => { });
      await browser?.close().catch(() => { });
    }
  }
}
