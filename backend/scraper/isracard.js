/**
 * Isracard scraper — ExportExcel approach.
 *
 * Strategy:
 *   1. Load saved cookies from .isracard-cookies.json
 *   2. Launch Firefox with saved cookies → check if session is still valid
 *      by navigating to web.isracard.co.il (which is NOT blocked)
 *   3. If session expired → login via digital.isracard.co.il (Firefox bypasses Cloudflare)
 *      and save new cookies
 *   4. For each billing month, call ExportExcel via page.evaluate(fetch(...))
 *      — this runs inside the authenticated browser session, bypassing the
 *      TLS-session binding that blocks raw Node.js HTTPS requests
 *   5. Parse the xlsx response, return transactions
 *
 * The browser is used only for the authenticated HTTP calls — no UI navigation.
 * Cookies are persisted so re-login only happens when the session expires (~24h).
 */

const { firefox } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '.isracard-cookies.json');
const BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/app/pw-browsers';
const MONTHS_BACK = 3;

// ── Cookie helpers ────────────────────────────────────────────────────────────

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const c = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      if (Array.isArray(c) && c.length) return c;
    }
  } catch (_) {}
  return null;
}

function saveCookies(cookies) {
  try {
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log(`[isracard] cookies saved (${cookies.length})`);
  } catch (e) {
    console.warn('[isracard] could not save cookies:', e.message);
  }
}

// ── Session check ─────────────────────────────────────────────────────────────

async function isSessionValid(page) {
  try {
    // web.isracard.co.il is NOT Cloudflare-blocked — use it for session checks
    const resp = await page.evaluate(async () => {
      const r = await fetch(
        'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/GetCardList',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'include' }
      );
      return { status: r.status };
    });
    return resp.status === 200;
  } catch (_) {
    return false;
  }
}

// ── Login (Firefox bypasses Cloudflare on digital.isracard.co.il) ─────────────

async function login(page, { id, card6Digits, password }) {
  console.log('[isracard] logging in...');

  await page.goto('https://digital.isracard.co.il/personalarea/Login/', {
    waitUntil: 'load', timeout: 30000
  });
  await page.waitForTimeout(3000);

  // Switch to password form
  await page.click('a[ng-click="vm.rotateView(true)"]');
  await page.waitForTimeout(1500);

  await page.click('#otpLoginId_ID');
  await page.type('#otpLoginId_ID', id, { delay: 60 });
  await page.click('#cardnum');
  await page.type('#cardnum', String(card6Digits), { delay: 60 });
  await page.click('#otpLoginPwd');
  await page.type('#otpLoginPwd', password, { delay: 60 });
  await page.waitForTimeout(800);

  await page.click('button[ng-click*="ResendNewLogin"]');

  // Wait for redirect away from login page
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    if (!page.url().includes('digital.isracard.co.il/personalarea/Login')) {
      console.log('[isracard] login ok, url:', page.url());
      return;
    }
  }
  throw new Error('Login failed — still on login page after 30s');
}

// ── ExportExcel for one billing month ─────────────────────────────────────────

async function exportMonth(page, { cardSuffix, companyCode, cardStatus, isPartner, billingMonth, isNextBillingDate }) {
  // Call ExportExcel via fetch() inside the authenticated browser context
  const result = await page.evaluate(
    async ({ cardSuffix, companyCode, cardStatus, isPartner, billingMonth, isNextBillingDate }) => {
      const r = await fetch(
        'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/ExportExcel',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            card4Number: cardSuffix,
            isNextBillingDate,
            cardStatus: Number(cardStatus) || 0,
            billingMonth,
            companyCode: Number(companyCode) || 11,
            isPartner: !!isPartner,
            shouldCallMonthlyBilling: false,
            serviceType: 31,
            getCardListCompanyCode: 99,
          }),
        }
      );
      if (!r.ok) return { error: r.status };
      // Read as base64 so we can pass binary data back to Node
      // Response is JSON: { data: { content: '<base64 xlsx>' }, isSuccess: true }
      const json = await r.json();
      const b64 = json?.data?.content;
      if (!b64) return { error: 'no content in response' };
      return { b64 };
    },
    { cardSuffix, companyCode, cardStatus, isPartner, billingMonth, isNextBillingDate }
  );

  if (result.error || !result.b64) {
    console.warn(`[isracard] ExportExcel ${billingMonth} → HTTP ${result.error}`);
    return [];
  }

  // Parse the xlsx
  const buf = Buffer.from(result.b64, 'base64');
  // DEBUG: save raw xlsx to disk
  try { fs.writeFileSync(`/tmp/isracard-${billingMonth.replace(///g,'-')}-${isNextBillingDate?'next':'prev'}.xlsx`, buf); } catch(_) {}
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find header row
  const headerIdx = rows.findIndex(r =>
    r.includes('תאריך רכישה') || r.includes('שם בית עסק')
  );
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx];
  const iDate         = headers.findIndex(h => String(h).includes('תאריך רכישה'));
  const iBiz          = headers.findIndex(h => String(h).includes('שם בית עסק'));
  const iAmt          = headers.findIndex(h => String(h).includes('סכום עסקה'));
  const iCur          = headers.findIndex(h => String(h).includes('מטבע עסקה'));
  const iIlsAmt       = headers.findIndex(h => String(h).includes('סכום חיוב'));

  const ILS_NAMES = new Set(['₪', 'שקל', 'ILS', 'NIS', 'שקל חדש', '']);

  const txns = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => c === '' || c === null)) continue;

    const rawDate  = String(row[iDate] || '').trim();
    const business = String(row[iBiz]  || '').trim();
    const txnAmt   = parseFloat(String(row[iAmt] || '').replace(/,/g, '')) || null;
    if (!rawDate || !business || txnAmt === null) continue;

    let date = rawDate;
    if (/^\d{2}\.\d{2}\.\d{2}$/.test(rawDate)) {
      const [d, m, y] = rawDate.split('.');
      date = `${d}/${m}/20${y}`;
    } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(rawDate)) {
      date = rawDate.replace(/\./g, '/');
    }

    const currency = String(row[iCur] || '').trim();
    const isIls    = ILS_NAMES.has(currency);

    // ILS billing amount: use dedicated column if exists, else fall back to txnAmt for ILS
    const ilsBilling = iIlsAmt >= 0
      ? parseFloat(String(row[iIlsAmt] || '').replace(/,/g, '')) || null
      : null;
    const amountILS = ilsBilling ?? (isIls ? txnAmt : null);

    // Foreign amount: original transaction amount when non-ILS
    const foreignAmount   = !isIls ? txnAmt : null;
    const foreignCurrency = !isIls ? currency : null;


    txns.push({
      date,
      business,
      amountILS:      amountILS ?? txnAmt,
      foreignAmount,
      foreignCurrency,
      currency:       currency || 'שקל חדש',
      currencySymbol: '₪',
      chargeType:     'זיכוי',
      card:           cardSuffix,
      confirmation:   `${date}-${business.trim().slice(0, 30)}-${txnAmt}`,
      _raw:           {},
    });
  }

  console.log(`[isracard] ExportExcel ${billingMonth} → ${txns.length} transactions`);
  return txns;
}

// ── Billing months helper ─────────────────────────────────────────────────────

function billingMonths(n) {
  const months = [];
  // Always start with NEXT month (isNextBillingDate=true) — this is the current
  // accumulating cycle that has not been charged yet (e.g. July charge on 02/07).
  const next = new Date();
  next.setDate(1);
  next.setMonth(next.getMonth() + 1);
  months.push({
    label: `01/${String(next.getMonth() + 1).padStart(2, '0')}/${next.getFullYear()}`,
    isNext: true,
  });
  // Then current month and n months back (isNextBillingDate=false)
  for (let i = 0; i <= n; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({
      label: `01/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      isNext: false,
    });
  }
  return months;
}

// ── Main export ───────────────────────────────────────────────────────────────

async function scrapeIsracard({ id, card6Digits, password }) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
  const savedCookies = loadCookies();

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });

  try {
    if (savedCookies) {
      await context.addCookies(savedCookies);
    }

    const page = await context.newPage();

    // Navigate to a minimal page to establish the session context
    await page.goto('https://web.isracard.co.il/', {
      waitUntil: 'load', timeout: 20000
    }).catch(() => {});
    await page.waitForTimeout(2000);

    // Check if session is valid
    let sessionOk = savedCookies ? await isSessionValid(page) : false;

    if (!sessionOk) {
      console.log('[isracard] session expired — re-logging in...');
      await login(page, { id, card6Digits, password });
      saveCookies(await context.cookies());
      // Verify session after login
      sessionOk = await isSessionValid(page);
      if (!sessionOk) throw new Error('Session still invalid after login');
    } else {
      console.log('[isracard] reusing saved session');
    }

    // Navigate to Transactions page so the SPA initialises and fires GetCardList
    // Intercept that call — it contains the card list with correct auth
    let cardsList = [];
    const cardListPromise = page.waitForResponse(
      r => r.url().includes('GetCardList') && r.request().method() === 'POST',
      { timeout: 20000 }
    ).catch(() => null);

    await page.goto('https://web.isracard.co.il/Transactions', {
      waitUntil: 'networkidle', timeout: 30000
    }).catch(() => {});
    await page.waitForTimeout(3000);

    const cardListResp = await cardListPromise;
    if (cardListResp) {
      try {
        const body = await cardListResp.json();
        cardsList = body?.data?.cardsList || [];
        console.log(`[isracard] ${cardsList.length} cards (intercepted)`);
      } catch (e) {
        console.warn('[isracard] GetCardList parse failed:', e.message);
      }
    } else {
      console.warn('[isracard] GetCardList intercept timed out — no cards');
    }

    // For each card × billing month, export xlsx
    const allTxns = [];
    const months = billingMonths(MONTHS_BACK);

    for (const card of cardsList) {
      for (const { label, isNext } of months) {
        const txns = await exportMonth(page, {
          cardSuffix:  card.cardSuffix,
          companyCode: card.companyCode,
          cardStatus:  card.cardStatus,
          isPartner:   card.isPartner,
          billingMonth: label,
          isNextBillingDate: isNext,
        });
        allTxns.push(...txns);
      }
    }

    // Save updated cookies
    saveCookies(await context.cookies());

    // Deduplicate by (date, business, amount)
    const seen = new Set();
    return allTxns.filter(t => {
      const key = `${t.date}|${t.business}|${t.amountILS}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = { scrapeIsracard };
