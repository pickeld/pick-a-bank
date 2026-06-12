const router = require('express').Router();
const { runScrape } = require('../scraper/runner');

let scrapeStatus = { running: false, lastRun: null, lastError: null };

// GET /api/scrape/status
router.get('/status', async (req, res) => {
  const pool = req.app.locals.pool;
  const { rows } = await pool.query('SELECT last_scrape FROM settings LIMIT 1').catch(() => ({ rows: [] }));
  res.json({ ...scrapeStatus, lastScrape: rows[0]?.last_scrape || null });
});

// POST /api/scrape/trigger  (runs on-server — may be blocked by Cloudflare)
router.post('/trigger', async (req, res) => {
  if (scrapeStatus.running) return res.json({ ok: false, message: 'Already running' });
  const pool = req.app.locals.pool;
  const { rows } = await pool.query('SELECT * FROM settings LIMIT 1');
  if (!rows.length) return res.status(400).json({ error: 'No settings configured' });

  scrapeStatus.running = true;
  res.json({ ok: true, message: 'Scrape started' });

  runScrape(pool, rows[0])
    .then(() => { scrapeStatus.running = false; scrapeStatus.lastRun = new Date(); scrapeStatus.lastError = null; })
    .catch(e => { scrapeStatus.running = false; scrapeStatus.lastError = e.message; console.error('[scrape] error:', e.message); });
});

// POST /api/scrape/upload  — receive pre-scraped transactions from local client
// Body: { source: 'isracard'|'discount', transactions: [...] }
router.post('/upload', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { source, transactions } = req.body;

    if (!source || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'source and transactions[] required' });
    }

    let inserted = 0;
    for (const t of transactions) {
      try {
        const confirmation = t.confirmation || t.seqConfirmationNumber || t.confirmationNumber ||
          `${t.date}-${t.business}-${t.amountILS}`;
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
            t.amountILS ?? t.ilsBillingAmount ?? t.amount,
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

    // Update last_scrape timestamp
    await pool.query('UPDATE settings SET last_scrape = NOW() WHERE id = (SELECT id FROM settings LIMIT 1)');

    console.log(`[upload] ${source}: ${inserted}/${transactions.length} new transactions`);
    res.json({ ok: true, inserted, total: transactions.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
