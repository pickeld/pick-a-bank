const { CompanyTypes, createScraper } = require('israeli-bank-scrapers');

async function scrapeDiscount({ id, password, num }) {
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const scraper = createScraper({
    companyId: CompanyTypes.discount,
    startDate,
    showBrowser: false,
  });

  const result = await scraper.scrape({ id, password, num });
  if (!result.success) throw new Error(result.errorMessage || result.errorType);

  const txns = [];
  for (const account of result.accounts || []) {
    for (const t of account.txns || []) {
      txns.push({
        date: t.date ? new Date(t.date).toLocaleDateString('he-IL').split('.').reverse().join('/') : null,
        business: t.description,
        description: null,
        amountILS: Math.abs(t.chargedAmount),
        originalAmount: t.originalAmount !== t.chargedAmount ? Math.abs(t.originalAmount) : null,
        currency: t.originalCurrency || 'ILS',
        currencySymbol: '₪',
        type: t.type,
        country: null,
        card: account.accountNumber,
        chargeType: t.chargedAmount < 0 ? 'חיוב' : 'זיכוי',
        confirmation: `${t.date}-${t.description}-${t.chargedAmount}`,
      });
    }
  }
  return txns;
}

module.exports = { scrapeDiscount };
