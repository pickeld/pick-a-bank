require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');

const settingsRouter = require('./routes/settings');
const transactionsRouter = require('./routes/transactions');
const scrapeRouter = require('./routes/scrape');
const analyticsRouter = require('./routes/analytics');
const { runScrape } = require('./scraper/runner');
const { initDb } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 5101;

// ── DB pool (shared) ──────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.locals.pool = pool;

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api/settings', settingsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/scrape', scrapeRouter);
app.use('/api/analytics', analyticsRouter);

// ── Boot ──────────────────────────────────────────────────────────────────
(async () => {
  await initDb(pool);
  app.listen(PORT, '0.0.0.0', () =>
    console.log(`[backend] listening on :${PORT}`)
  );

  // Schedule scrape job based on saved settings
  cron.schedule('0 * * * *', async () => {
    const { rows } = await pool.query('SELECT * FROM settings LIMIT 1');
    if (!rows.length) return;
    const s = rows[0];
    const now = new Date();
    const lastScrape = s.last_scrape ? new Date(s.last_scrape) : null;
    const intervalHours = s.scrape_interval_hours || 6;
    if (!lastScrape || (now - lastScrape) / 3600000 >= intervalHours) {
      console.log('[cron] triggering scrape');
      await runScrape(pool, s);
    }
  });
})();
