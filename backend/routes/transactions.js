const router = require('express').Router();

// GET /api/transactions?source=all&search=&from=&to=&page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { source = 'all', search = '', from = '', to = '', page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];

    if (source !== 'all') {
      params.push(source);
      conditions.push(`source = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`business ILIKE $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`date <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM transactions ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    const dataRes = await pool.query(
      `SELECT * FROM transactions ${where} ORDER BY date DESC, scraped_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: dataRes.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions/stats
// Dates stored as DD/MM/YYYY — use LIKE '%/MM/YYYY' for month matching
router.get('/stats', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const now = new Date();

    // DD/MM/YYYY format month patterns
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mmLast  = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    const yyyyLast = lastMonthDate.getFullYear();

    const thisMonthPattern = `%/${mm}/${yyyy}`;
    const lastMonthPattern = `%/${mmLast}/${yyyyLast}`;

    const [thisMonthRes, lastMonthRes, biggestRes, dailyRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count
         FROM transactions WHERE date LIKE $1 AND charge_type='חיוב'`,
        [thisMonthPattern]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount_ils),0) as total
         FROM transactions WHERE date LIKE $1 AND charge_type='חיוב'`,
        [lastMonthPattern]
      ),
      pool.query(
        `SELECT business, amount_ils FROM transactions WHERE charge_type='חיוב' ORDER BY amount_ils DESC LIMIT 1`
      ),
      // Daily totals for last 30 days — parse DD/MM/YYYY to date for comparison
      pool.query(`
        SELECT date, SUM(amount_ils) as total
        FROM transactions
        WHERE to_date(date, 'DD/MM/YYYY') >= NOW() - INTERVAL '30 days'
          AND charge_type = 'חיוב'
        GROUP BY date
        ORDER BY to_date(date, 'DD/MM/YYYY') ASC
      `),
    ]);

    res.json({
      thisMonth: {
        total: parseFloat(thisMonthRes.rows[0].total),
        count: parseInt(thisMonthRes.rows[0].count),
      },
      lastMonth: { total: parseFloat(lastMonthRes.rows[0].total) },
      biggest: biggestRes.rows[0] || null,
      daily: dailyRes.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
