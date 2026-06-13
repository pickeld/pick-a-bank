const router = require('express').Router();
const { categorize } = require('../lib/categorize');

// Isracard semantics:
//   charge_type = 'זיכוי'  →  individual purchase transactions (the actual spend)
//   charge_type = 'חיוב'   →  billing events (monthly bill sent to bank) — NOT individual purchases
// Discount semantics:
//   charge_type = 'חיוב'   →  bank account debits (outflows)
//   charge_type = 'זיכוי'  →  bank account credits (salary, refunds)
const ISRACARD_SPEND = `source='isracard' AND charge_type='זיכוי'`;

// GET /api/transactions?source=all&search=&category=&from=&to=&page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { source = 'all', search = '', category = '', from = '', to = '', page = 1, limit = 50 } = req.query;

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
    if (category === '__uncategorized__') {
      conditions.push(`category IS NULL`);
    } else if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`to_date(date,'DD/MM/YYYY') >= to_date($${params.length},'DD/MM/YYYY')`);
    }
    if (to) {
      params.push(to);
      conditions.push(`to_date(date,'DD/MM/YYYY') <= to_date($${params.length},'DD/MM/YYYY')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM transactions ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    const dataRes = await pool.query(
      `SELECT id, source, date, business, description, amount_ils, original_amount,
              currency, currency_symbol, type, country, card, charge_type, category, category_locked, scraped_at
       FROM transactions ${where}
       ORDER BY to_date(date,'DD/MM/YYYY') DESC, scraped_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: dataRes.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/transactions/:id  — set category manually
router.patch('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { id } = req.params;
    const { category } = req.body;
    await pool.query(
      `UPDATE transactions SET category = $1, category_locked = true WHERE id = $2`,
      [category || null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions/categories?month=MM/YYYY
router.get('/categories', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { month } = req.query;

    const now = new Date();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const pattern = `%/${month || `${mm}/${yyyy}`}`;

    const { rows } = await pool.query(
      `SELECT COALESCE(category, 'other') as category,
              COUNT(*) as count,
              COALESCE(SUM(amount_ils), 0) as total
       FROM transactions
       WHERE date LIKE $1 AND ${ISRACARD_SPEND}
       GROUP BY COALESCE(category, 'other')
       ORDER BY total DESC`,
      [pattern]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/transactions/stats
router.get('/stats', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const now = new Date();

    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mmLast   = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    const yyyyLast = lastMonthDate.getFullYear();

    const thisMonthPattern = `%/${mm}/${yyyy}`;
    const lastMonthPattern = `%/${mmLast}/${yyyyLast}`;

    const [thisMonthRes, lastMonthRes, biggestRes, dailyRes, categoryRes, ccChargesRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count
         FROM transactions WHERE date LIKE $1 AND ${ISRACARD_SPEND}`,
        [thisMonthPattern]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount_ils),0) as total
         FROM transactions WHERE date LIKE $1 AND ${ISRACARD_SPEND}`,
        [lastMonthPattern]
      ),
      pool.query(
        `SELECT business, amount_ils FROM transactions
         WHERE ${ISRACARD_SPEND} AND amount_ils IS NOT NULL
         ORDER BY amount_ils DESC LIMIT 1`
      ),
      pool.query(`
        SELECT date, SUM(amount_ils) as total
        FROM transactions
        WHERE to_date(date,'DD/MM/YYYY') >= NOW() - INTERVAL '30 days'
          AND ${ISRACARD_SPEND}
        GROUP BY date
        ORDER BY to_date(date,'DD/MM/YYYY') ASC
      `),
      pool.query(
        `SELECT COALESCE(category,'other') as category,
                COUNT(*) as count,
                COALESCE(SUM(amount_ils),0) as total
         FROM transactions
         WHERE date LIKE $1 AND ${ISRACARD_SPEND}
         GROUP BY COALESCE(category,'other')
         ORDER BY total DESC`,
        [thisMonthPattern]
      ),
      // Discount: monthly Isracard bill hits (debit from bank account)
      pool.query(`
        SELECT date,
               SUM(CASE WHEN charge_type='חיוב' THEN amount_ils ELSE 0 END) as charged,
               SUM(CASE WHEN charge_type='זיכוי' THEN amount_ils ELSE 0 END) as credited
        FROM transactions
        WHERE source='discount'
          AND (business ILIKE '%ישראכרט%' OR business ILIKE '%visa%' OR business ILIKE '%כרטיס%')
        GROUP BY date
        ORDER BY to_date(date,'DD/MM/YYYY') DESC
        LIMIT 6
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
      categories: categoryRes.rows,
      ccCharges: ccChargesRes.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
