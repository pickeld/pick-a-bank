const router = require('express').Router();

const CATEGORIES = [
  'dining','groceries','household','transport','travel','shopping',
  'health','telecom','entertainment','finance','kids','pets',
  'personal','rent','transfers','other',
];

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const now  = new Date();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const month = req.query.month || `${mm}/${yyyy}`;
    const { rows } = await pool.query(
      'SELECT * FROM budgets WHERE month=$1 ORDER BY category', [month]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/auto', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const now  = new Date();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const month = req.query.month || `${mm}/${yyyy}`;

    // Average per category over last 12 months of Isracard purchases
    const { rows } = await pool.query(`
      SELECT
        COALESCE(category,'other') as category,
        ROUND(AVG(monthly_total)::numeric, 0) as suggested
      FROM (
        SELECT
          COALESCE(category,'other') as category,
          to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') as month_key,
          SUM(amount_ils) as monthly_total
        FROM transactions
        WHERE source='isracard' AND charge_type='זיכוי'
          AND to_date(date,'DD/MM/YYYY') >= NOW() - INTERVAL '12 months'
        GROUP BY COALESCE(category,'other'), to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')
      ) sub
      GROUP BY COALESCE(category,'other')
      ORDER BY suggested DESC
    `);

    // Also get actual spent this month
    const [mm2, yyyy2] = month.split('/');
    const pattern = `%/${mm2}/${yyyy2}`;
    const { rows: actual } = await pool.query(`
      SELECT COALESCE(category,'other') as category, COALESCE(SUM(amount_ils),0) as spent
      FROM transactions
      WHERE source='isracard' AND charge_type='זיכוי' AND date LIKE $1
      GROUP BY COALESCE(category,'other')
    `, [pattern]);

    const actualMap = {};
    actual.forEach(r => { actualMap[r.category] = parseFloat(r.spent); });

    const result = CATEGORIES.map(cat => {
      const found = rows.find(r => r.category === cat);
      return {
        category: cat,
        suggested: found ? parseFloat(found.suggested) : 0,
        actual: actualMap[cat] || 0,
      };
    });

    res.json({ month, budgets: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { month, category, amount } = req.body;
    await pool.query(
      `INSERT INTO budgets (month, category, amount) VALUES ($1,$2,$3)
       ON CONFLICT (month, category) DO UPDATE SET amount=$3`,
      [month, category, amount]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bulk', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { month, budgets } = req.body;
    for (const { category, amount } of budgets) {
      await pool.query(
        `INSERT INTO budgets (month, category, amount) VALUES ($1,$2,$3)
         ON CONFLICT (month, category) DO UPDATE SET amount=$3`,
        [month, category, amount]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:month/:category', async (req, res) => {
  try {
    await req.app.locals.pool.query(
      'DELETE FROM budgets WHERE month=$1 AND category=$2',
      [req.params.month, req.params.category]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
