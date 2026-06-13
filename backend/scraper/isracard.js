const https = require('https');
const { URL } = require('url');

// ── Mini HTTP client with cookie jar ─────────────────────────────────────────
function createClient() {
  const jar = {};

  function parseCookies(headers) {
    const lines = headers['set-cookie'] || [];
    for (const line of lines) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      jar[name.trim()] = rest.join('=').trim();
    }
  }

  function cookieHeader() {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function request(method, url, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = body ? JSON.stringify(body) : null;
      const options = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
          'Origin': `https://${u.hostname}`,
          'Referer': `https://${u.hostname}/`,
          'Cookie': cookieHeader(),
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
          ...extraHeaders,
        },
      };

      const req = https.request(options, res => {
        parseCookies(res.headers);
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(raw); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text: raw, json });
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
      if (data) req.write(data);
      req.end();
    });
  }

  return { request, jar };
}

function extractAntiForgeryToken(html) {
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  return m ? m[1] : null;
}

// ── Isracard pure-HTTP scraper ────────────────────────────────────────────────
async function scrapeIsracard({ id, card6Digits, password }) {
  const client = createClient();

  console.log('[isracard] loading login page...');
  const loginPage = await client.request('GET', 'https://digital.isracard.co.il/personalarea/Login/', null);
  const token = extractAntiForgeryToken(loginPage.text);

  console.log('[isracard] validating credentials...');
  const validate = await client.request('POST',
    'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx?reqName=ValidateIdDataNoReg',
    { id, idType: '1', cardSuffix: card6Digits, sisma: password, checkLevel: '1', companyCode: '11', countryCode: '212', isGoogleCaptcha: true },
    token ? { 'X-Requested-With': 'XMLHttpRequest', '__RequestVerificationToken': token } : {}
  );
  const validateData = validate.json?.ValidateIdDataNoRegBean;
  if (!validateData || validateData.returnCode !== '1') {
    throw new Error(`ValidateIdDataNoReg failed: ${JSON.stringify(validateData)}`);
  }

  await client.request('POST',
    'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx?reqName=IsRegisterNoReg',
    { id, idType: '1' }
  );

  await client.request('POST',
    'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx?reqName=ReportUserData',
    { customerId: id, customerIdType: '1', customerIdCountry: '212', loginTypeId: 1, deviceLanguage: 'he-IL' }
  ).catch(() => {});

  console.log('[isracard] logging in...');
  const loginRes = await client.request('POST',
    'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx?reqName=performLogonI',
    { MisparZihuy: id, countryCode: '212', idType: '1', Sisma: password, cardSuffix: card6Digits }
  );
  const loginData = loginRes.json;
  if (!loginData || loginData.returnCode !== '1') {
    throw new Error(`performLogonI failed: returnCode=${loginData?.returnCode} message=${loginData?.message}`);
  }
  console.log(`[isracard] logged in as ${loginData.firstName?.trim()}`);

  console.log('[isracard] establishing web session...');
  await client.request('GET', 'https://web.isracard.co.il/Transactions', null,
    { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  );

  console.log('[isracard] fetching card list...');
  const cardListRes = await client.request('POST',
    'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/GetCardList',
    {}
  );
  const cardsList = cardListRes.json?.data?.cardsList || [];
  console.log(`[isracard] ${cardsList.length} cards`);

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

  const months = pastBillingMonths(3);
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Collect regular txns and abroad vouchers separately so we know which is which
  const regularTxns  = [];
  const abroadTxns   = [];

  for (const card of cardsList) {
    const { cardSuffix, companyCode, cardStatus, isPartner } = card;
    for (const billingMonth of months) {
      const res = await client.request('POST',
        'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/GetTransactionsList',
        {
          card4Number: cardSuffix,
          isNextBillingDate: billingMonth === months[0],
          cardStatus: Number(cardStatus) || 0,
          billingMonth,
          companyCode: Number(companyCode) || 11,
          isPartner: !!isPartner,
        }
      );
      const d = res.json?.data || {};
      regularTxns.push(
        ...(d.approvals?.approvedTransactions || []),
        ...(d.approvals?.monthlyTransactions  || [])
      );
      // Tag abroad vouchers so we can handle them separately
      const abroad = d.israelAbroadVouchers?.vouchers?.israelAbroadVouchersList || [];
      if (abroad.length > 0) {
        console.log(`[isracard] abroad voucher keys: ${Object.keys(abroad[0]).join(', ')}`);
      }
      abroadTxns.push(...abroad.map(t => ({ ...t, _isAbroad: true })));
    }
  }

  const allTxns = [...regularTxns, ...abroadTxns];

  function parseILDate(s) {
    if (!s) return new Date(0);
    const [d, m, y] = s.split('/');
    return new Date(`${y}-${m}-${d}`);
  }

  // ILS currency synonyms used by Isracard
  const ILS_NAMES = new Set(['שקל חדש', 'ש"ח', 'NIS', 'ILS', '₪']);

  const seen = new Set();
  return allTxns
    .filter(t => {
      const key = `${t.seqConfirmationNumber || ''}_${t.businessName}_${t.purchaseDate}_${t.ilsBillingAmount}_${t.cardSuffix}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return parseILDate(t.purchaseDate) >= startDate;
    })
    .map(t => {
      const isAbroad = !!t._isAbroad;

      // For regular transactions:
      //   ilsBillingAmount  = ILS billed amount  ✓
      //   originalAmount    = foreign currency amount (null if ILS)
      //   currencyName      = foreign currency name
      //
      // For abroad vouchers (israelAbroadVouchersList):
      //   The field mapping is different — we log the keys above so we can
      //   verify after the first successful scrape.
      //   Best-effort: try all known field name variants.
      const rawIls = t.ilsBillingAmount ?? t.ilsAmount ?? t.paymentSum ?? t.chargedAmount;
      const rawForeign = t.originalAmount ?? t.dealSum ?? t.foreignAmount ?? t.voucherAmount;
      const rawCurrency = t.currencyName ?? t.foreignCurrencyName ?? t.currencyId;

      // Determine which is ILS and which is foreign
      const currencyIsIls = !rawCurrency || ILS_NAMES.has(rawCurrency);
      const ilsAmount   = rawIls;
      const foreignAmt  = !currencyIsIls && rawForeign !== rawIls ? rawForeign : null;
      const foreignCurr = !currencyIsIls ? rawCurrency : null;

      return {
        date:            t.purchaseDate,
        business:        t.businessName,
        description:     t.transactionDescription || null,
        // amount_ils: the ILS-billed amount (what actually leaves your account)
        amountILS:       ilsAmount,
        // foreign amount + currency: the original charge in local currency
        foreignAmount:   foreignAmt,
        foreignCurrency: foreignCurr,
        currency:        rawCurrency || 'שקל חדש',
        currencySymbol:  t.currencySimbol || '₪',
        type:            t.tranzacCodeDescription || null,
        country:         t.countryCode && t.countryCode !== 'ISR' ? t.country : null,
        card:            t.cardSuffix,
        chargeType:      t.creditOrCharge === 1 ? 'חיוב' : 'זיכוי',
        confirmation:    t.seqConfirmationNumber || t.confirmationNumber || null,
        // Preserve the full raw API object so we never lose field names again
        _raw:            t,
      };
    });
}

module.exports = { scrapeIsracard };
