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

  function cookieHeader(url) {
    const u = new URL(url);
    return Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
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
          'Cookie': cookieHeader(url),
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
          resolve({ status: res.status, headers: res.headers, text: raw, json });
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

// ── Helper to get the Anti-Forgery token from the login page HTML ─────────────
function extractAntiForgeryToken(html) {
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  return m ? m[1] : null;
}

// ── Isracard pure-HTTP scraper ────────────────────────────────────────────────
async function scrapeIsracard({ id, card6Digits, password }) {
  const client = createClient();

  // 1. Load login page — get session cookies + anti-forgery token
  console.log('[isracard] loading login page...');
  const loginPage = await client.request('GET', 'https://digital.isracard.co.il/personalarea/Login/', null);
  const token = extractAntiForgeryToken(loginPage.text);

  // 2. Validate credentials (step 1 of login flow)
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

  // 3. Check registration
  await client.request('POST',
    'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx?reqName=IsRegisterNoReg',
    { id, idType: '1' }
  );

  // 4. Report user data (required before performLogonI)
  await client.request('POST',
    'https://digital.isracard.co.il/services/ProxyRequestHandler.ashx?reqName=ReportUserData',
    { customerId: id, customerIdType: '1', customerIdCountry: '212', loginTypeId: 1, deviceLanguage: 'he-IL' }
  ).catch(() => {});

  // 5. Perform login
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

  // 6. Navigate to web.isracard.co.il to get its session cookies
  console.log('[isracard] establishing web session...');
  await client.request('GET', 'https://web.isracard.co.il/Transactions', null,
    { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  );

  // 7. Get card list
  console.log('[isracard] fetching card list...');
  const cardListRes = await client.request('POST',
    'https://web.isracard.co.il/ocp/transactions/DigitalV3.Transactions/GetCardList',
    {}
  );
  const cardsList = cardListRes.json?.data?.cardsList || [];
  console.log(`[isracard] ${cardsList.length} cards`);

  // 8. Fetch transactions for each card × each billing month
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
  const allTxns = [];

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
      allTxns.push(
        ...(d.approvals?.approvedTransactions || []),
        ...(d.approvals?.monthlyTransactions  || []),
        ...(d.israelAbroadVouchers?.vouchers?.israelAbroadVouchersList || [])
      );
    }
  }

  function parseILDate(s) {
    if (!s) return new Date(0);
    const [d, m, y] = s.split('/');
    return new Date(`${y}-${m}-${d}`);
  }

  const seen = new Set();
  return allTxns
    .filter(t => {
      const key = `${t.seqConfirmationNumber||''}_${t.businessName}_${t.purchaseDate}_${t.ilsBillingAmount}_${t.cardSuffix}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return parseILDate(t.purchaseDate) >= startDate;
    })
    .map(t => ({
      date: t.purchaseDate,
      business: t.businessName,
      description: t.transactionDescription || null,
      amountILS: t.ilsBillingAmount,
      originalAmount: t.originalAmount !== t.ilsBillingAmount ? t.originalAmount : null,
      currency: t.currencyName || 'שקל חדש',
      currencySymbol: t.currencySimbol || '₪',
      type: t.tranzacCodeDescription || null,
      country: t.countryCode && t.countryCode !== 'ISR' ? t.country : null,
      card: t.cardSuffix,
      chargeType: t.creditOrCharge === 1 ? 'חיוב' : 'זיכוי',
      confirmation: t.seqConfirmationNumber || t.confirmationNumber || null,
    }));
}

module.exports = { scrapeIsracard };
