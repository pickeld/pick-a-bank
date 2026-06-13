/**
 * Isracard scraper using Playwright Firefox.
 *
 * Firefox bypasses Cloudflare where Chromium gets blocked.
 *
 * Session persistence:
 *   - Cookies saved to .isracard-cookies.json after every successful login.
 *   - On each scrape, saved cookies are loaded first.
 *   - If session is expired (redirected back to login) → fresh login + save.
 *   - This avoids creating new sessions on every scrape, which triggers bot detection.
 *
 * Login form (from live inspection):
 *   #otpLoginId_ID       — ת.ז. / ID number
 *   #cardnum             — last 4 digits of card
 *   #otpLoginPwd         — password
 *   button "כניסה לחשבון שלי" — submit
 */

const { firefox } = require('playwright');
const fs   = require('fs');
const path = require('path');

const COOKIES_PATH    = path.join(__dirname, '.isracard-cookies.json');
const BROWSERS_PATH   = process.env.PLAYWRIGHT_BROWSERS_PATH || '/app/pw-browsers';
const START_DATE_DAYS = 90;

// ── cookie helpers ────────────────────────────────────────────────────────────

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      if (Array.isArray(cookies) && cookies.length) return cookies;
    }
  } catch (_) {}
  return null;
}

function saveCookies(cookies) {
  try {
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log(`[isracard] cookies saved (${cookies.length} entries)`);
  } catch (e) {
    console.warn('[isracard] could not save cookies:', e.message);
  }
}

// ── browser factory ───────────────────────────────────────────────────────────

async function launchBrowser() {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
  return firefox.launch({ headless: true });
}

// ── check if saved session is still valid ─────────────────────────────────────

async function isSessionValid(page) {
  try {
    await page.goto('https://web.isracard.co.il/Transactions', {
      waitUntil: 'load',
      timeout: 20000,
    });
    const url = page.url();
    if (url.includes('/Login') || url.includes('/login') || url.includes('personalarea')) {
      console.log('[isracard] session expired');
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

// ── login ─────────────────────────────────────────────────────────────────────

async function login(page, { id, card6Digits, password }) {
  console.log('[isracard] logging in via Firefox...');

  await page.goto('https://digital.isracard.co.il/personalarea/Login/', {
    waitUntil: 'load',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Fill ID number
  await page.fill('#otpLoginId_ID', id);
  // Fill last 4 digits (field accepts 4 digits despite being called "card6Digits" in settings)
  const last4 = String(card6Digits).slice(-4);
  await page.fill('#cardnum', last4);
  // Fill password
  await page.fill('#otpLoginPwd', password);

  // Submit
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {}),
    page.click('button:has-text("כניסה לחשבון שלי")').catch(() =>
      page.keyboard.press('Enter')
    ),
  ]);

  await page.waitForTimeout(3000);

  const url = page.url();
  const title = await page.title().catch(() => '');
  console.log('[isracard] post-login url:', url, 'title:', title.slice(0, 60));

  if (url.includes('/Login') || title.includes('כניסה')) {
    throw new Error('Login failed — still on login page after submit');
  }
}

// ── fetch transactions by running API calls inside the browser context ─────────

async function fetchAllTransactions(page) {
  const startDate = new Date(Date.now() - START_DATE_DAYS * 24 * 60 * 60 * 1000);
  const allTxns   = [];

  // Navigate to Transactions page — triggers initial API calls
  console.log('[isracard] loading transactions page...');
  await page.goto('https://web.isracard.co.il/Transactions', {
    waitUntil: 'load',
    timeout: 60000,
  });
  await page.waitForTimeout(5000);

  // Get card list
  let cardsList = [];
  try {
    const cardListResp = await page.evaluate(async () => {
      const r = await fetch(
        'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/GetCardList',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'include' }
      );
      return r.json();
    });
    cardsList = cardListResp?.data?.cardsList || [];
    console.log(`[isracard] ${cardsList.length} cards found`);
  } catch (e) {
    console.warn('[isracard] GetCardList failed:', e.message);
  }

  // Past billing months
  function pastBillingMonths(n) {
    const months = [];
    for (let i = 0; i <= n; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push(`01/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
    }
    return months;
  }

  for (const card of cardsList) {
    for (const billingMonth of pastBillingMonths(3)) {
      try {
        const resp = await page.evaluate(
          async ({ cardSuffix, companyCode, cardStatus, isPartner, billingMonth }) => {
            const r = await fetch(
              'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/GetTransactionsList',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  card4Number: cardSuffix,
                  isNextBillingDate: false,
                  cardStatus: Number(cardStatus) || 0,
                  billingMonth,
                  companyCode: Number(companyCode) || 11,
                  isPartner: !!isPartner,
                }),
                credentials: 'include',
              }
            );
            return r.json();
          },
          {
            cardSuffix:  card.cardSuffix,
            companyCode: card.companyCode,
            cardStatus:  card.cardStatus,
            isPartner:   card.isPartner,
            billingMonth,
          }
        );

        const d = resp?.data || {};
        const abroad = d.israelAbroadVouchers?.vouchers?.israelAbroadVouchersList || [];

        // Log field names of first abroad voucher so we can verify mapping
        if (abroad.length > 0) {
          console.log('[isracard] abroad voucher keys:', Object.keys(abroad[0]).join(', '));
        }

        allTxns.push(
          ...(d.approvals?.approvedTransactions || []).map(t => ({ ...t, _source: 'approved' })),
          ...(d.approvals?.monthlyTransactions  || []).map(t => ({ ...t, _source: 'monthly' })),
          ...abroad.map(t => ({ ...t, _source: 'abroad' }))
        );
      } catch (e) {
        console.warn(`[isracard] failed ${billingMonth} card ${card.cardSuffix}:`, e.message);
      }
    }
  }

  return { allTxns, startDate };
}

// ── map raw API transaction → normalised object ───────────────────────────────

function mapTransaction(t) {
  const ILS_NAMES = new Set(['שקל חדש', 'ש"ח', 'שח', 'שקל', 'NIS', 'ILS', '₪', '']);

  // Field names differ between regular and abroad vouchers
  // Regular:  ilsBillingAmount (ILS), originalAmount / dealSum (foreign)
  // Abroad:   paymentSum / paymentSumOutbound (ILS), dealSumOutbound / originalAmount (foreign)
  const rawIls      = t.ilsBillingAmount ?? t.paymentSum ?? t.paymentSumOutbound ?? t.chargedAmount;
  const rawForeign  = t.originalAmount   ?? t.dealSum    ?? t.dealSumOutbound    ?? t.foreignAmount;
  const rawCurrency = t.currencyName     ?? t.currencyId ?? t.foreignCurrencyName;

  const currencyIsIls = !rawCurrency || ILS_NAMES.has(rawCurrency);
  const foreignAmt    = !currencyIsIls && rawForeign !== rawIls ? rawForeign : null;
  const foreignCurr   = !currencyIsIls ? rawCurrency : null;

  const date     = t.purchaseDate ?? t.fullPurchaseDate ?? t.fullPurchaseDateOutbound ?? t.date;
  const business = (t.businessName ?? t.fullSupplierNameHeb ?? t.fullSupplierNameOutbound ?? t.description ?? '').trim();
  const confirmation = t.seqConfirmationNumber ?? t.voucherNumberRatz ?? t.voucherNumberRatzOutbound ?? t.confirmationNumber ?? null;

  return {
    date,
    business,
    description:     t.transactionDescription ?? t.moreInfo ?? null,
    amountILS:       rawIls,
    foreignAmount:   foreignAmt,
    foreignCurrency: foreignCurr,
    currency:        rawCurrency || 'שקל חדש',
    currencySymbol:  t.currencySimbol ?? '₪',
    type:            t.tranzacCodeDescription ?? t.type ?? null,
    country:         (t.countryCode && t.countryCode !== 'ISR') ? t.country : null,
    card:            t.cardSuffix ?? null,
    chargeType:      t.creditOrCharge === 1 ? 'חיוב' : 'זיכוי',
    confirmation,
    _raw:            t,
  };
}

// ── main export ───────────────────────────────────────────────────────────────

async function scrapeIsracard({ id, card6Digits, password }) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });

  try {
    // 1. Load saved cookies
    const savedCookies = loadCookies();
    if (savedCookies) {
      console.log('[isracard] loading saved session cookies...');
      await context.addCookies(savedCookies);
    }

    const page = await context.newPage();

    // 2. Check if saved session is still valid
    let sessionOk = savedCookies ? await isSessionValid(page) : false;

    // 3. Fresh login if needed
    if (!sessionOk) {
      await login(page, { id, card6Digits, password });
      // Save cookies immediately after login
      saveCookies(await context.cookies());
    }

    // 4. Fetch transactions
    const { allTxns, startDate } = await fetchAllTransactions(page);
    console.log(`[isracard] fetched ${allTxns.length} raw transactions`);

    // 5. Save updated cookies (session may have refreshed)
    saveCookies(await context.cookies());

    // 6. Deduplicate + filter + map
    function parseILDate(s) {
      if (!s) return new Date(0);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const [d, m, y] = s.split('/');
        return new Date(`${y}-${m}-${d}`);
      }
      return new Date(s);
    }

    const seen = new Set();
    return allTxns
      .filter(t => {
        const date = t.purchaseDate ?? t.fullPurchaseDate ?? t.fullPurchaseDateOutbound ?? t.date ?? '';
        const biz  = (t.businessName ?? t.fullSupplierNameHeb ?? t.description ?? '').trim();
        const amt  = t.ilsBillingAmount ?? t.paymentSum ?? '';
        const conf = t.seqConfirmationNumber ?? t.voucherNumberRatz ?? '';
        const key  = `${conf}_${biz}_${date}_${amt}_${t.cardSuffix ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return parseILDate(date) >= startDate;
      })
      .map(mapTransaction)
      .filter(t => t.date && t.business && t.amountILS != null);

  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { scrapeIsracard };
