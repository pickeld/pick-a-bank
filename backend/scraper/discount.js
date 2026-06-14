const { firefox } = require('playwright');
const fs   = require('fs');
const path = require('path');

const BASE_URL     = 'https://start.telebank.co.il';
const COOKIES_PATH = path.join(__dirname, '.discount-cookies.json');

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const raw = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      if (Array.isArray(raw) && raw.length) return raw;
    }
  } catch (_) {}
  return null;
}

async function saveCookies(ctx) {
  const cookies = await ctx.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log(`[discount] cookies saved (${cookies.length})`);
}

async function scrapeDiscount({ id, password, num }) {
  const playwrightOpts = process.env.PLAYWRIGHT_BROWSERS_PATH
    ? { executablePath: undefined }
    : {};

  const b   = await firefox.launch({ headless: true, ...playwrightOpts });
  const ctx = await b.newContext({ locale: 'he-IL' });

  const saved = loadCookies();
  if (saved) {
    await ctx.addCookies(saved);
    console.log(`[discount] reusing saved session`);
  }

  const p = await ctx.newPage();

  try {
    // ── Try reusing session first ───────────────────────────────────────────
    await p.goto(`${BASE_URL}/apollo/retail2/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(2000);

    const needsLogin = p.url().includes('LOGIN_PAGE') || p.url().includes('/login/');

    if (needsLogin) {
      console.log('[discount] session expired — logging in...');
      await p.goto(`${BASE_URL}/login/#/LOGIN_PAGE`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForSelector('#tzId', { timeout: 15000 });

      await p.fill('#tzId', id);
      await p.fill('#tzPassword', password);
      await p.fill('#aidnum', num);
      await p.click('.sendBtn');
      await p.waitForTimeout(5000);

      if (p.url().includes('LOGIN_PAGE') || p.url().includes('/login/')) {
        const errText = await p.evaluate(() => {
          const el = document.querySelector('#general-error, .error-message, [class*="error"]');
          return el ? el.textContent.trim().slice(0, 200) : 'unknown';
        });
        throw new Error(`Login failed: ${errText}`);
      }

      console.log('[discount] login OK');
      await saveCookies(ctx);
    } else {
      console.log('[discount] session reused OK');
    }

    // ── Fetch account list ──────────────────────────────────────────────────
    const accountData = await p.evaluate(async (baseUrl) => {
      const r = await fetch(`${baseUrl}/Titan/gatewayAPI/userAccountsData`, { credentials: 'include' });
      return { status: r.status, body: await r.json().catch(() => null) };
    }, BASE_URL);

    if (accountData.status !== 200 || !accountData.body) {
      throw new Error(`userAccountsData failed: HTTP ${accountData.status}`);
    }

    const accounts = accountData.body?.UserAccountsData?.UserAccounts?.map(a => a.NewAccountInfo.AccountID) || [];
    console.log(`[discount] ${accounts.length} account(s): ${accounts.join(', ')}`);

    // ── Fetch transactions (90 days) ────────────────────────────────────────
    const fromDate    = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const fromDateStr = fromDate.toISOString().slice(0, 10).replace(/-/g, '');
    const txns        = [];

    for (const accountId of accounts) {
      const txnData = await p.evaluate(async ({ baseUrl, accountId, fromDateStr }) => {
        const url = `${baseUrl}/Titan/gatewayAPI/lastTransactions/${accountId}/Date?IsCategoryDescCode=True&IsTransactionDetails=True&IsEventNames=True&IsFutureTransactionFlag=True&FromDate=${fromDateStr}`;
        const r   = await fetch(url, { credentials: 'include' });
        return { status: r.status, body: await r.json().catch(() => null) };
      }, { baseUrl: BASE_URL, accountId, fromDateStr });

      if (txnData.status !== 200 || !txnData.body) {
        console.warn(`[discount] account ${accountId}: HTTP ${txnData.status}`);
        continue;
      }

      const completed = txnData.body?.CurrentAccountLastTransactions?.OperationEntry || [];
      const pending   = txnData.body?.CurrentAccountLastTransactions?.FutureTransactionsBlock?.FutureTransactionEntry || [];
      const all       = [...completed, ...pending];
      console.log(`[discount] account ${accountId}: ${all.length} transactions`);

      for (const t of all) {
        const raw  = String(t.OperationDate || '');
        const yr   = raw.slice(0, 4);
        const mo   = raw.slice(4, 6);
        const dy   = raw.slice(6, 8);
        const date = dy && mo && yr ? `${dy}/${mo}/${yr}` : null;

        const amount   = Math.abs(t.OperationAmount || 0);
        const isCharge = (t.OperationAmount || 0) < 0;

        txns.push({
          date,
          business:        t.OperationDescriptionToDisplay || t.OperationDescription,
          description:     null,
          amountILS:       amount,
          foreignAmount:   null,
          foreignCurrency: null,
          currency:        'ILS',
          currencySymbol:  '₪',
          type:            null,
          country:         null,
          card:            accountId,
          chargeType:      isCharge ? 'חיוב' : 'זיכוי',
          confirmation:    `${t.OperationDate}-${t.OperationNumber}-${t.OperationAmount}`,
        });
      }
    }

    await saveCookies(ctx);
    return txns;

  } finally {
    await b.close();
  }
}

module.exports = { scrapeDiscount };
