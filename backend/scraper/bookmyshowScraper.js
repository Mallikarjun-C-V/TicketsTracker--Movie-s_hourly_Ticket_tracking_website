
import { chromium } from 'playwright';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import {
  assertPublicDestination,
  validateBookMyShowUrl
} from '../utils/urlSafety.js';
import { parseTicketCount } from '../utils/numberParser.js';

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';

const LOG = '[BMS-DIAGNOSTICS]';
const MAX_BLOCKED_LOGS = 100;

function safeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(rawUrl || '').slice(0, 200);
  }
}

function logError(stage, error, extra = {}) {
  console.error(`${LOG} ERROR: ${stage}`, {
    message: error?.message || String(error),
    name: error?.name,
    code: error?.code,
    stack: error?.stack,
    cause: error?.cause?.message,
    ...extra
  });
}

export class AuthorizedBookMyShowProvider {

  async collect(tracker) {
    const startedAt = Date.now();
    let browser;
    let context;
    let page;

    let blockedRequests = 0;
    let failedRequests = 0;
    let serverErrors = 0;

    const trackerInfo = {
      trackerId: String(tracker._id),
      movie: tracker.movieLabel,
      url: safeUrl(tracker.bookMyShowUrl),
      provider: env.BMS_PROVIDER,
      scrapingEnabled: env.BMS_SCRAPING_ENABLED,
      authorized: env.BMS_AUTHORIZED,
      liveReady: env.LIVE_PROVIDER_READY,
      headless: env.BROWSER_HEADLESS,
      navigationTimeout: env.BROWSER_NAVIGATION_TIMEOUT_MS,
      allowedHosts: env.BMS_ALLOWED_HOSTS,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    };

    console.log('\n==============================================');
    console.log(`${LOG} NEW COLLECTION ATTEMPT`);
    console.log(`${LOG} Started at: ${new Date().toISOString()}`);
    console.log(`${LOG} Configuration:`, trackerInfo);
    console.log('==============================================');

    try {

      // STEP 1: CHECK CONFIGURATION

      console.log(`${LOG} STEP 1: Checking live provider configuration`);

      if (!env.LIVE_PROVIDER_READY) {
        console.error(`${LOG} LIVE PROVIDER IS NOT READY`, {
          BMS_PROVIDER: env.BMS_PROVIDER,
          BMS_SCRAPING_ENABLED: env.BMS_SCRAPING_ENABLED,
          BMS_AUTHORIZED: env.BMS_AUTHORIZED
        });

        return {
          success: false,
          errorCode: 'LIVE_PROVIDER_DISABLED',
          errorMessage: 'Live collection is disabled. Check provider configuration.'
        };
      }

      console.log(`${LOG} Configuration check PASSED`);

      // STEP 2: VALIDATE URL

      console.log(`${LOG} STEP 2: Validating BookMyShow URL`);

      const targetUrl = validateBookMyShowUrl(
        tracker.bookMyShowUrl,
        env.BMS_ALLOWED_HOSTS
      );

      console.log(`${LOG} URL validation PASSED:`, safeUrl(targetUrl));

      // STEP 3: DNS VALIDATION

      console.log(`${LOG} STEP 3: Checking DNS and public destination`);

      await assertPublicDestination(
        targetUrl,
        env.BMS_ALLOWED_HOSTS
      );

      console.log(`${LOG} DNS validation PASSED`);

      // STEP 4: LAUNCH CHROMIUM

      console.log(`${LOG} STEP 4: Launching Chromium`);

      console.log(`${LOG} Browser launch options:`, {
        headless: env.BROWSER_HEADLESS
      });

      browser = await chromium.launch({
        headless: env.BROWSER_HEADLESS
      });

      console.log(`${LOG} Chromium launched successfully`);
      console.log(`${LOG} Browser version:`, browser.version());

      // STEP 5: CREATE BROWSER CONTEXT

      console.log(`${LOG} STEP 5: Creating browser context`);

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

      console.log(`${LOG} Browser context created`);

      // STEP 6: CREATE PAGE

      page = await context.newPage();

      page.setDefaultTimeout(8000);
      page.setDefaultNavigationTimeout(
        env.BROWSER_NAVIGATION_TIMEOUT_MS
      );

      console.log(`${LOG} STEP 6: Browser page created`);

      // STEP 7: MONITOR BROWSER ERRORS

      page.on('pageerror', (error) => {
        logError('Browser JavaScript page error', error);
      });

      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          console.log(`${LOG} BROWSER CONSOLE:`, {
            type: message.type(),
            message: message.text().slice(0, 500)
          });
        }
      });

      page.on('requestfailed', (request) => {
        failedRequests++;

        console.error(`${LOG} NETWORK REQUEST FAILED`, {
          url: safeUrl(request.url()),
          method: request.method(),
          resourceType: request.resourceType(),
          error: request.failure()?.errorText || 'Unknown network error'
        });
      });

      page.on('response', (response) => {
        const status = response.status();
        const request = response.request();

        if (status >= 400) {
          if (status >= 500) serverErrors++;

          console.error(`${LOG} HTTP ERROR RESPONSE`, {
            status,
            statusText: response.statusText(),
            url: safeUrl(response.url()),
            resourceType: request.resourceType()
          });
        }

        if (request.isNavigationRequest()) {
          console.log(`${LOG} NAVIGATION RESPONSE`, {
            status,
            url: safeUrl(response.url())
          });
        }
      });

      // STEP 8: REQUEST INTERCEPTION

      console.log(`${LOG} STEP 8: Installing request interceptor`);

      const RESOURCE_SUFFIXES = [
        'bookmyshow.com',
        'bmscdn.com'
      ];

      await page.route('**/*', async (route) => {
        const request = route.request();

        try {
          const url = new URL(request.url());

          const isMainFrameNavigation =
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame();

          if (isMainFrameNavigation) {

            console.log(`${LOG} MAIN FRAME NAVIGATION:`, {
              url: safeUrl(request.url())
            });

            try {
              await assertPublicDestination(
                request.url(),
                env.BMS_ALLOWED_HOSTS
              );
            } catch (error) {
              logError('MAIN FRAME NAVIGATION BLOCKED', error, {
                url: safeUrl(request.url())
              });

              blockedRequests++;
              await route.abort('blockedbyclient').catch(() => {});
              return;
            }

            await route.continue();
            return;
          }

          const host = url.hostname.toLowerCase();

          const allowed =
            url.protocol === 'https:' &&
            RESOURCE_SUFFIXES.some(
              (suffix) =>
                host === suffix ||
                host.endsWith('.' + suffix)
            );

          if (!allowed) {
            blockedRequests++;

            if (blockedRequests <= MAX_BLOCKED_LOGS) {
              console.warn(`${LOG} RESOURCE BLOCKED`, {
                url: safeUrl(request.url()),
                hostname: host,
                protocol: url.protocol,
                resourceType: request.resourceType()
              });
            }

            await route.abort('blockedbyclient').catch(() => {});
            return;
          }

          await route.continue();

        } catch (error) {
          blockedRequests++;

          logError('REQUEST INTERCEPTION ERROR', error, {
            url: safeUrl(request.url())
          });

          await route.abort('blockedbyclient').catch(() => {});
        }
      });

      console.log(`${LOG} Request interceptor installed`);

      // STEP 9: OPEN BOOKMYSHOW PAGE

      console.log(`${LOG} STEP 9: Navigating to BookMyShow`);

      console.log(`${LOG} Target URL:`, safeUrl(targetUrl));

      const navigationStarted = Date.now();

      const navigationResponse = await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: env.BROWSER_NAVIGATION_TIMEOUT_MS
      });

      console.log(`${LOG} PAGE NAVIGATION COMPLETED`, {
        durationMs: Date.now() - navigationStarted,
        status: navigationResponse?.status(),
        finalUrl: safeUrl(page.url()),
        title: await page.title().catch(() => 'Unable to get title')
      });

      // STEP 10: WAIT FOR TICKET INFORMATION

      console.log(`${LOG} STEP 10: Waiting for ticket information`);

      try {
        await page.getByText(
          /(?:last|past|previous)\s*(?:1|one)\s*(?:hour|hr)/i
        ).first().waitFor({
          state: 'visible',
          timeout: 15000
        });

        console.log(`${LOG} One-hour ticket information FOUND`);

      } catch (error) {
        console.warn(`${LOG} One-hour ticket information NOT FOUND within 15 seconds`, {
          message: error.message
        });
      }

      // STEP 11: READ PAGE CONTENT

      console.log(`${LOG} STEP 11: Reading page content`);

      const bodyText = await page.locator('body')
        .innerText()
        .catch((error) => {
          logError('Unable to read page body', error);
          return '';
        });

      console.log(`${LOG} PAGE INFORMATION`, {
        title: await page.title().catch(() => ''),
        currentUrl: safeUrl(page.url()),
        bodyLength: bodyText.length,
        bodyStart: bodyText.slice(0, 600),
        failedRequests,
        blockedRequests,
        serverErrors
      });

      // STEP 12: CHECK CAPTCHA

      console.log(`${LOG} STEP 12: Checking page access status`);

      if (/verify (?:that )?you are human|captcha|unusual traffic/i.test(bodyText)) {

        console.error(`${LOG} CAPTCHA / HUMAN VERIFICATION DETECTED`);

        return {
          success: false,
          errorCode: 'CAPTCHA_DETECTED',
          errorMessage: 'The page presented a human-verification challenge. Live tracking has been paused.'
        };
      }

      if (/access denied|temporarily blocked|request blocked/i.test(bodyText)) {

        console.error(`${LOG} ACCESS DENIED BY BOOKMYSHOW`);

        return {
          success: false,
          errorCode: 'ACCESS_DENIED',
          errorMessage: 'BookMyShow denied access to the page.'
        };
      }

      console.log(`${LOG} Page access check completed`);

      // STEP 13: CHECK COUNTER SELECTOR

      console.log(`${LOG} STEP 13: Checking ticket counter selector`);

      const selector =
        env.BMS_COUNTER_SELECTOR || '.sc-1qdowf4-0.iGNlkn';

      console.log(`${LOG} Using selector:`, selector);

      const counterLocator = page.locator(selector);

      const counterCount = Math.min(
        await counterLocator.count(),
        10
      );

      console.log(`${LOG} Matching counter elements:`, counterCount);

      // STEP 14: EXTRACT AND VERIFY COUNTER

      console.log(`${LOG} STEP 14: Extracting ticket counter`);

      for (let index = 0; index < counterCount; index += 1) {

        const target = counterLocator.nth(index);

        const nodeData = await target.evaluate((element) => {

          const valueText = (
            element.innerText ||
            element.textContent ||
            ''
          ).replace(/\s+/g, ' ').trim();

          const ancestorTexts = [];

          let ancestor = element.parentElement;

          for (
            let depth = 0;
            ancestor && depth < 7;
            depth += 1, ancestor = ancestor.parentElement
          ) {
            const text = (
              ancestor.innerText ||
              ancestor.textContent ||
              ''
            ).replace(/\s+/g, ' ').trim();

            if (text && text.length <= 1200) {
              ancestorTexts.push(text);
            }
          }

          return { valueText, ancestorTexts };

        }).catch((error) => {
          logError('Counter element evaluation failed', error, {
            index
          });

          return {
            valueText: '',
            ancestorTexts: []
          };
        });

        console.log(`${LOG} COUNTER CANDIDATE`, {
          index,
          displayedValue: nodeData.valueText,
          ancestors: nodeData.ancestorTexts.slice(0, 4)
        });

        if (!nodeData.valueText) {
          console.warn(`${LOG} Empty counter value`, { index });
          continue;
        }

        const verifiedContext = nodeData.ancestorTexts.find((text) =>
          /(?:\b(?:last|past|previous)\s*(?:one|1)\s*(?:hour|hours|hr|hrs)\b|\b(?:last|past|previous)\s*60\s*minutes?\b)/i.test(text) &&
          /\b(?:tickets?|bookings?|booked|sold|purchased)\b/i.test(text)
        );

        if (!verifiedContext) {
          console.warn(`${LOG} Counter context verification FAILED`, {
            index,
            value: nodeData.valueText
          });

          continue;
        }

        console.log(`${LOG} Counter context VERIFIED`, {
          index,
          context: verifiedContext.slice(0, 500)
        });

        const parsed = parseTicketCount(
          nodeData.valueText,
          env.BMS_COUNTER_REGEX,
          verifiedContext
        );

        console.log(`${LOG} PARSER RESULT`, {
          index,
          matched: parsed.matched,
          ticketsSold: parsed.ticketsSold,
          rawDisplayedText: parsed.rawDisplayedText,
          precision: parsed.precision
        });

        if (
          parsed.matched &&
          parsed.ticketsSold !== null
        ) {

          console.log(`${LOG} COLLECTION SUCCESSFUL`, {
            ticketsSold: parsed.ticketsSold,
            rawDisplayedText: parsed.rawDisplayedText,
            precision: parsed.precision,
            durationMs: Date.now() - startedAt
          });

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

        console.warn(`${LOG} Counter parsing FAILED`, {
          index,
          displayedValue: nodeData.valueText
        });
      }

      // STEP 15: FALLBACK BODY TEXT PARSING

      console.log(`${LOG} STEP 15: Trying fallback body-text parsing`);

      const lines = bodyText
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);

      console.log(`${LOG} Total body text lines:`, lines.length);

      for (const line of lines) {

        if (
          /(?:last|past|previous)\s*(?:1|one|60)\s*(?:hour|hours|minutes?|hr)/i.test(line) ||
          /\d[\d,.]*\s*(?:K|M)?\s*(?:tickets?|bookings?)\b/i.test(line)
        ) {
          console.log(`${LOG} FALLBACK CANDIDATE:`, line.slice(0, 300));
        }

        const parsed = parseTicketCount(line, env.BMS_COUNTER_REGEX);

        if (parsed.matched && parsed.ticketsSold !== null) {

          console.log(`${LOG} FALLBACK COLLECTION SUCCESSFUL`, {
            ticketsSold: parsed.ticketsSold,
            rawDisplayedText: parsed.rawDisplayedText,
            precision: parsed.precision,
            durationMs: Date.now() - startedAt
          });

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

      // STEP 16: METRIC NOT FOUND

      console.error(`${LOG} TICKET METRIC NOT FOUND`, {
        selector,
        matchingElements: counterCount,
        pageTitle: await page.title().catch(() => ''),
        finalUrl: safeUrl(page.url()),
        bodyLength: bodyText.length,
        bodyStart: bodyText.slice(0, 1000),
        blockedRequests,
        failedRequests,
        serverErrors
      });

      return {
        success: false,
        errorCode: 'TARGET_METRIC_NOT_FOUND',
        errorMessage: 'The previous-one-hour ticket-sales wording was not found. Check the page structure and configured selector.'
      };

    } catch (error) {

      // STEP 17: ACTUAL ERROR DETAILS

      logError('COLLECTION FAILED', error, {
        trackerId: String(tracker._id),
        movie: tracker.movieLabel,
        url: safeUrl(tracker.bookMyShowUrl),
        currentPageUrl: page ? safeUrl(page.url()) : null,
        browserLaunched: Boolean(browser),
        contextCreated: Boolean(context),
        pageCreated: Boolean(page),
        blockedRequests,
        failedRequests,
        serverErrors,
        durationMs: Date.now() - startedAt
      });

      if (error instanceof AppError) {
        return {
          success: false,
          errorCode: error.code,
          errorMessage: error.message
        };
      }

      const message = error?.message || 'The authorized page could not be collected.';
      const isTimeout = /timeout/i.test(message);

      return {
        success: false,
        errorCode: isTimeout ? 'PAGE_TIMEOUT' : 'LIVE_COLLECTION_FAILED',
        errorMessage: isTimeout
          ? 'The page did not respond within the configured time limit.'
          : 'The authorized page could not be collected. Check the backend terminal for diagnostic details.'
      };

    } finally {

      // STEP 18: CLEANUP

      console.log(`${LOG} STEP 18: Closing browser resources`);

      if (context) {
        await context.close().catch((error) => {
          logError('Browser context close failed', error);
        });
      }

      if (browser) {
        await browser.close().catch((error) => {
          logError('Browser close failed', error);
        });
      }

      console.log(`${LOG} COLLECTION ATTEMPT FINISHED`, {
        trackerId: String(tracker._id),
        durationMs: Date.now() - startedAt,
        blockedRequests,
        failedRequests,
        serverErrors,
        finishedAt: new Date().toISOString()
      });

      console.log('==============================================\n');
    }
  }
}
