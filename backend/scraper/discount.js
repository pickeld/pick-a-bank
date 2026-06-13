/**
 * Discount Bank scraper using israeli-bank-scrapers.
 *
 * Session persistence: cookies saved to .discount-cookies.json after each
 * successful scrape and reinjected on the next run to avoid repeated logins.
 *
 * The cookie hook uses Playwright's Browser.contexts() API correctly.
 */

const { CompanyTypes, createScraper } = require('israeli-bank-scrapers');
const fs   = require('fs');
const path = require('path');

const COOKIES_PATH  = path.join(__dirname, '.discount-cookies.json');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      if (Array.isArray(raw) && raw.length) return raw;
    }
  } catch (_) {}
  return null;
}

function saveCookies(cookies) {
  try {
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log(`[discount] cookies saved (${cookies.length} entries)`);
  } catch (e) {
    console.warn('[discount] could not save cookies:', e.message);
  }
}

async function scrapeDiscount({ id, password, num }) {
  const startDate    = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const savedCookies = loadCookies();

  const scraper = createScraper({
    companyId:   CompanyTypes.discount,
    startDate,
    showBrowser: false,
    browser: {
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
    // Pass saved cookies so the scraper can reuse an existing session
    ...(savedCookies ? { cookies: savedCookies } : {}),
  });

  scraper.onProgress((phase) => {
    if (phase === 'LOGGING_IN')          console.log('[discount] logging in...');
    if (phase === 'FETCHING_TRANSACTIONS') console.log('[discount] fetching transactions...');
  });

  const result = await scraper.scrape({ id, password, num });

  // Save cookies after scrape — israeli-bank-scrapers exposes browser via scraper.browser
  // which is a Playwright Browser; contexts() returns the list of BrowserContexts.
  if (result.success) {
    try {
      const browser = scraper.browser;
      if (browser) {
        // Playwright Browser.contexts() (not pages()) returns BrowserContext[]
        const contexts = browser.contexts ? browser.contexts() : [];
        const ctx = contexts[0];
        if (ctx) {
          const cookies = await ctx.cookies();
          if (cookies?.length) saveCookies(cookies);
        }
      }
    } catch (e) {
      // Non-fatal — worst case we just re-login next time
      console.warn('[discount] could not save cookies:', e.message);
    }
  }

  if (!result.success) {
    throw new Error(result.errorMessage || result.errorType || 'Discount scrape failed');
  }

  const txns = [];
  for (const account of result.accounts || []) {
    for (const t of account.txns || []) {
      const amount   = Math.abs(t.chargedAmount ?? t.originalAmount ?? 0);
      const isCharge = (t.chargedAmount ?? 0) < 0;

      let date = t.date;
      if (date) {
        const d  = new Date(date);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        date = `${dd}/${mm}/${d.getFullYear()}`;
      }

      txns.push({
        date,
        business:        t.description,
        description:     null,
        amountILS:       amount,
        foreignAmount:   null,
        foreignCurrency: null,
        currency:        t.originalCurrency || 'ILS',
        currencySymbol:  '₪',
        type:            t.type || null,
        country:         null,
        card:            account.accountNumber,
        chargeType:      isCharge ? 'חיוב' : 'זיכוי',
        confirmation:    `${t.date}-${t.description}-${t.chargedAmount}`,
      });
    }
  }

  return txns;
}

module.exports = { scrapeDiscount };
