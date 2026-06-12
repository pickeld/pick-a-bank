const { chromium } = require('playwright');

async function typeSlowly(page, selector, text) {
  await page.locator(selector).click();
  await page.locator(selector).fill('');
  for (const char of String(text)) {
    await page.locator(selector).press(char);
    await page.waitForTimeout(40);
  }
}

function pastBillingMonths(n) {
  const months = [];
  for (let i = 0; i <= n; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`01/${mm}/${d.getFullYear()}`);
  }
  return months;
}

function parseILDate(s) {
  if (!s) return new Date(0);
  const [d, m, y] = s.split('/');
  return new Date(`${y}-${m}-${d}`);
}

async function scrapeIsracard({ id, card6Digits, password }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();

  const allTxns = [];
  let baseRequestBody = null;
  let cardsList = [];

  page.on('request', req => {
    if (req.url().includes('GetTransactionsList') && !baseRequestBody) {
      try { baseRequestBody = JSON.parse(req.postData()); } catch {}
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('GetCardList')) {
      try {
        const body = await response.json();
        cardsList = body?.data?.cardsList || [];
      } catch {}
    }
    if (url.includes('GetTransactionsList')) {
      try {
        const body = await response.json();
        const d = body?.data || {};
        const approved = d.approvals?.approvedTransactions || [];
        const monthly  = d.approvals?.monthlyTransactions  || [];
        const vouchers = d.israelAbroadVouchers?.vouchers?.israelAbroadVouchersList || [];
        allTxns.push(...approved, ...monthly, ...vouchers);
      } catch {}
    }
  });

  try {
    await page.goto('https://digital.isracard.co.il/personalarea/Login/', { waitUntil: 'domcontentloaded' });
    await page.locator('#flip').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#flip').click();
    await page.locator('#otpLoginId_ID').waitFor({ state: 'visible', timeout: 10000 });
    await typeSlowly(page, '#otpLoginId_ID', id);
    await typeSlowly(page, '#cardnum', card6Digits);
    await typeSlowly(page, '#otpLoginPwd', password);

    const loginDone = page.waitForResponse(r => r.url().includes('performLogonI'), { timeout: 30000 });
    await page.locator('#otpLobbyFormPassword button:has-text("כניסה")').click();
    const loginData = await (await loginDone).json();
    if (loginData.returnCode !== '1') throw new Error(`Login failed: ${loginData.message || loginData.returnCode}`);

    await page.goto('https://web.isracard.co.il/Transactions', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    if (!baseRequestBody) throw new Error('Could not capture base request body');

    const months = pastBillingMonths(3);
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    for (const card of cardsList) {
      const { cardSuffix, companyCode, cardStatus, isPartner } = card;
      for (const billingMonth of months) {
        const isNext = billingMonth === months[0];
        const reqBody = { ...baseRequestBody, card4Number: cardSuffix, cardStatus: Number(cardStatus) || 0, companyCode: Number(companyCode) || 11, isPartner: !!isPartner, billingMonth, isNextBillingDate: isNext };
        const result = await page.evaluate(async (body) => {
          const res = await fetch('/ocp/transactions/DigitalV3.Transactions/GetTransactionsList', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          const text = await res.text();
          if (!text.trim().startsWith('{')) return { ok: false };
          const json = JSON.parse(text);
          const d = json?.data || {};
          return {
            ok: true,
            approved: d.approvals?.approvedTransactions || [],
            monthly:  d.approvals?.monthlyTransactions  || [],
            vouchers: d.israelAbroadVouchers?.vouchers?.israelAbroadVouchersList || [],
          };
        }, reqBody);
        if (result.ok) allTxns.push(...result.approved, ...result.monthly, ...result.vouchers);
      }
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
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeIsracard };
