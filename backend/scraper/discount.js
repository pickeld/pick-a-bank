const { CompanyTypes, createScraper } = require('israeli-bank-scrapers');

async function scrapeDiscount({ id, password, num }) {
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const scraper = createScraper({
    companyId: CompanyTypes.discount,
    startDate,
    showBrowser: false,
  });

  const result = await scraper.scrape({ id, password, num });
  if (!result.success) {
    throw new Error(result.errorMessage || result.errorType || 'Discount scrape failed');
  }

  const txns = [];
  for (const account of result.accounts || []) {
    for (const t of account.txns || []) {
      const amount = Math.abs(t.chargedAmount ?? t.originalAmount ?? 0);
      const isCharge = (t.chargedAmount ?? 0) < 0;

      // Format date: scraper returns ISO string
      let date = t.date;
      if (date) {
        const d = new Date(date);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        date = `${dd}/${mm}/${yyyy}`;
      }

      txns.push({
        date,
        business: t.description,
        description: null,
        amountILS: amount,
        originalAmount: t.originalAmount && Math.abs(t.originalAmount) !== amount ? Math.abs(t.originalAmount) : null,
        currency: t.originalCurrency || 'ILS',
        currencySymbol: '₪',
        type: t.type || null,
        country: null,
        card: account.accountNumber,
        chargeType: isCharge ? 'חיוב' : 'זיכוי',
        confirmation: `${t.date}-${t.description}-${t.chargedAmount}`,
      });
    }
  }

  return txns;
}

module.exports = { scrapeDiscount };
