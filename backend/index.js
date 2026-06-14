require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cron = require('node-cron');

const settingsRouter     = require('./routes/settings');
const transactionsRouter = require('./routes/transactions');
const scrapeRouter       = require('./routes/scrape');
const analyticsRouter    = require('./routes/analytics');
const importRouter       = require('./routes/import');
const cardsRouter        = require('./routes/cards');
const budgetsRouter      = require('./routes/budgets');
const pushRouter         = require('./routes/push');
const { runScrape } = require('./scraper/runner');
const { initDb }    = require('./db/init');

const app  = express();
const PORT = process.env.PORT || 5101;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.locals.pool = pool;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api/settings',     settingsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/scrape',       scrapeRouter);
app.use('/api/analytics',    analyticsRouter);
app.use('/api/import',       importRouter);
app.use('/api/cards',        cardsRouter);
app.use('/api/budgets',      budgetsRouter);
app.use('/api/push',         pushRouter);

(async () => {
  await initDb(pool);
  app.listen(PORT, '0.0.0.0', () => console.log(`[backend] listening on :${PORT}`));

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
