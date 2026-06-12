const router = require('express').Router();
const { runScrape } = require('../scraper/runner');

let scrapeStatus = { running: false, lastRun: null, lastError: null };

// GET /api/scrape/status
router.get('/status', async (req, res) => {
  const pool = req.app.locals.pool;
  const { rows } = await pool.query('SELECT last_scrape FROM settings LIMIT 1').catch(() => ({ rows: [] }));
  res.json({ ...scrapeStatus, lastScrape: rows[0]?.last_scrape || null });
});

// POST /api/scrape/trigger
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

module.exports = router;
