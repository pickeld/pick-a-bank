require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
const cron    = require('node-cron');

const authRouter         = require('./routes/auth');
const settingsRouter     = require('./routes/settings');
const transactionsRouter = require('./routes/transactions');
const scrapeRouter       = require('./routes/scrape');
const analyticsRouter    = require('./routes/analytics');
const importRouter       = require('./routes/import');
const cardsRouter        = require('./routes/cards');
const budgetsRouter      = require('./routes/budgets');
const pushRouter         = require('./routes/push');
const { authMiddleware } = require('./middleware/auth');
const { runScrape }      = require('./scraper/runner');
const { initDb }         = require('./db/init');

const app  = express();
const PORT = process.env.PORT || 5101;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.locals.pool = pool;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api', authMiddleware);
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

  // Run every minute — check each user's scrape_time in their timezone
  cron.schedule('* * * * *', async () => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM settings
         WHERE isracard_id IS NOT NULL OR discount_id IS NOT NULL`
      );
      for (const s of rows) {
        const tz       = s.scrape_timezone || 'Asia/Jerusalem';
        const target   = s.scrape_time     || '08:00';
        const [tH, tM] = target.split(':').map(Number);

        // Current time in user's timezone
        const now      = new Date();
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const uH       = userTime.getHours();
        const uM       = userTime.getMinutes();

        if (uH !== tH || uM !== tM) continue;

        // Don't scrape twice in the same minute
        if (s.last_scrape) {
          const diff = (now - new Date(s.last_scrape)) / 60000;
          if (diff < 1) continue;
        }

        console.log(`[cron] scraping for user ${s.user_id} at ${target} ${tz}`);
        runScrape(pool, s, s.user_id).catch(e =>
          console.error('[cron] scrape error:', e.message)
        );
      }
    } catch (e) {
      console.error('[cron] error:', e.message);
    }
  });
})();
