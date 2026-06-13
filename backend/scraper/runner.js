const { scrapeIsracard } = require('./isracard');
const { scrapeDiscount } = require('./discount');

async function upsertTransactions(pool, source, txns) {
  let inserted = 0;
  for (const t of txns) {
    try {
      // amount_ils: the scraper already normalises to t.amountILS
      const amountIls = t.amountILS ?? t.ilsBillingAmount ?? t.amount;

      // confirmation: use whatever the scraper provides; fall back to a
      // deterministic key built from fields that are always present.
      // NEVER include undefined in the fallback string.
      const confirmation =
        t.confirmation ||
        t.seqConfirmationNumber ||
        t.confirmationNumber ||
        `${t.date || t.purchaseDate}-${(t.business || t.businessName || '').trim()}-${amountIls}`;

      await pool.query(
        `INSERT INTO transactions
           (source, date, business, description, amount_ils, original_amount,
            currency, currency_symbol, type, country, card, charge_type, confirmation, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (source, confirmation, date, business, amount_ils) DO NOTHING`,
        [
          source,
          t.date || t.purchaseDate,
          t.business || t.businessName,
          t.description || t.transactionDescription || null,
          amountIls,
          t.originalAmount || null,
          t.currency || 'ILS',
          t.currencySymbol || '₪',
          t.type || t.tranzacCodeDescription || null,
          t.country || null,
          t.card || t.cardSuffix || null,
          t.chargeType || (t.creditOrCharge === 1 ? 'חיוב' : 'זיכוי'),
          confirmation,
          JSON.stringify(t),
        ]
      );
      inserted++;
    } catch (_) {}
  }
  return inserted;
}

async function runScrape(pool, settings) {
  console.log('[scraper] starting...');
  const results = { isracard: 0, discount: 0, errors: [] };

  // ── Isracard ──────────────────────────────────────────────────────────────
  if (settings.isracard_id && settings.isracard_card6 && settings.isracard_password) {
    try {
      console.log('[scraper] scraping Isracard...');
      const txns = await scrapeIsracard({
        id: settings.isracard_id,
        card6Digits: settings.isracard_card6,
        password: settings.isracard_password,
      });
      results.isracard = await upsertTransactions(pool, 'isracard', txns);
      console.log(`[scraper] Isracard: ${results.isracard} new transactions`);
    } catch (e) {
      console.error('[scraper] Isracard error:', e.message);
      results.errors.push(`isracard: ${e.message}`);
    }
  }

  // ── Discount ──────────────────────────────────────────────────────────────
  if (settings.discount_id && settings.discount_password) {
    try {
      console.log('[scraper] scraping Discount...');
      const txns = await scrapeDiscount({
        id: settings.discount_id,
        password: settings.discount_password,
        num: settings.discount_num,
      });
      results.discount = await upsertTransactions(pool, 'discount', txns);
      console.log(`[scraper] Discount: ${results.discount} new transactions`);
    } catch (e) {
      console.error('[scraper] Discount error:', e.message);
      results.errors.push(`discount: ${e.message}`);
    }
  }

  await pool.query('UPDATE settings SET last_scrape = NOW() WHERE id = (SELECT id FROM settings LIMIT 1)');
  console.log('[scraper] done:', results);
  return results;
}

module.exports = { runScrape };
