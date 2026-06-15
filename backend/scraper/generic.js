const { createScraper } = require('israeli-bank-scrapers');
const { categorize } = require('../lib/categorize');

async function scrapeGeneric({ company, credentials }) {
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const scraper = createScraper({
    companyId: company,
    startDate,
    showBrowser: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 60000,
    defaultTimeout: 60000,
  });

  const result = await scraper.scrape(credentials);
  if (!result.success) {
    throw new Error(result.errorMessage || result.errorType || `${company} scrape failed`);
  }

  const txns = [];
  for (const account of result.accounts || []) {
    for (const t of account.txns || []) {
      const amount = Math.abs(t.chargedAmount ?? t.originalAmount ?? 0);
      const isCharge = (t.chargedAmount ?? 0) < 0;

      let date = t.date;
      if (date) {
        const d = new Date(date);
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

module.exports = { scrapeGeneric };
