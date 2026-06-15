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
const loansRouter        = require('./routes/loans');
const savingsRouter      = require('./routes/savings');
const recurringRouter    = require('./routes/recurring');
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
app.use('/api/loans',        loansRouter);
app.use('/api/savings',      savingsRouter);
app.use('/api/recurring',    recurringRouter);

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

  // Digest cron — every minute, check if any user is due for a digest notification
  cron.schedule('0 * * * *', async () => {
    try {
      const { rows } = await pool.query(
        `SELECT s.*, p.id as push_id, p.device_name, p.endpoint
         FROM settings s
         JOIN push_subscriptions p ON p.user_id = s.user_id
         WHERE s.notify_daily_digest = true
           AND s.digest_interval_hours IS NOT NULL
           AND s.digest_interval_hours > 0`
      );
      const now = new Date();
      for (const s of rows) {
        const lastDigest = s.last_digest ? new Date(s.last_digest) : null;
        const intervalMs = (s.digest_interval_hours || 24) * 3600000;
        if (lastDigest && (now - lastDigest) < intervalMs) continue;

        // Build digest message
        const { rows: stats } = await pool.query(
          `SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count
           FROM transactions
           WHERE user_id=$1 AND source='isracard' AND charge_type='זיכוי'
             AND to_date(date,'DD/MM/YYYY') >= NOW() - INTERVAL '24 hours'`,
          [s.user_id]
        );
        const total = parseFloat(stats[0]?.total || 0);
        const count = parseInt(stats[0]?.count || 0);
        const body = count > 0
          ? `${count} פעולות ב-24 שעות האחרונות · סה"כ ₪${total.toLocaleString('he-IL', {maximumFractionDigits:0})}`
          : 'אין פעולות חדשות ב-24 שעות האחרונות';

        // Mark digest sent
        await pool.query(
          `UPDATE settings SET last_digest = NOW() WHERE user_id=$1`,
          [s.user_id]
        );
        console.log(`[digest] sent to user ${s.user_id}: ${body}`);
      }
    } catch (e) { console.error('[digest] error:', e.message); }
  });
})();
