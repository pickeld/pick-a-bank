const router = require('express').Router();
const { categorize } = require('../lib/categorize');

const ISRACARD_SPEND = `source='isracard' AND charge_type='זיכוי'`;

router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { source = 'all', search = '', category = '', from = '', to = '', billing_cycle = '', page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];

    if (source !== 'all') { params.push(source); conditions.push(`source = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`business ILIKE $${params.length}`); }
    if (category === '__uncategorized__') {
      conditions.push(`category IS NULL`);
    } else if (category) {
      params.push(category); conditions.push(`category = $${params.length}`);
    }
    if (billing_cycle === 'next') {
      conditions.push(`to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') = (SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') FROM transactions WHERE source='isracard' ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1)`);
    } else if (billing_cycle === 'prev') {
      conditions.push(`to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') = (SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') FROM transactions WHERE source='isracard' AND to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') != (SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') FROM transactions WHERE source='isracard' ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1) ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1) AND source='isracard'`);
    } else {
      if (from) { params.push(from); conditions.push(`to_date(date,'DD/MM/YYYY') >= to_date($\${params.length},'DD/MM/YYYY')`); }
      if (to)   { params.push(to);   conditions.push(`to_date(date,'DD/MM/YYYY') <= to_date($\${params.length},'DD/MM/YYYY')`); }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await pool.query(`SELECT COUNT(*) FROM transactions ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);
    const dataRes = await pool.query(
      `SELECT id, source, date, business, description, amount_ils, ils_amount, foreign_amount, foreign_currency,
              currency, currency_symbol, type, country, card, charge_type, category, category_locked, scraped_at
       FROM transactions ${where}
       ORDER BY to_date(date,'DD/MM/YYYY') DESC, scraped_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: dataRes.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { category } = req.body;
    await pool.query(`UPDATE transactions SET category = $1, category_locked = true WHERE id = $2`, [category || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/categories', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { month } = req.query;
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const pattern = `%/${month || `${mm}/${yyyy}`}`;
    const { rows } = await pool.query(
      `SELECT COALESCE(category,'other') as category, COUNT(*) as count, COALESCE(SUM(amount_ils),0) as total
       FROM transactions WHERE date LIKE $1 AND ${ISRACARD_SPEND}
       GROUP BY COALESCE(category,'other') ORDER BY total DESC`,
      [pattern]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const now  = new Date();

    const mm      = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy    = now.getFullYear();
    const prevD   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mmLast  = String(prevD.getMonth() + 1).padStart(2, '0');
    const yyyyLast = prevD.getFullYear();

    const thisMonthPattern = `%/${mm}/${yyyy}`;
    const lastMonthPattern = `%/${mmLast}/${yyyyLast}`;

    const [
      thisMonthRes, lastMonthRes, biggestRes, dailyRes, categoryRes,
      nextCCRes, salaryRes, lastCCRes, fixedRes,
    ] = await Promise.all([
      // Current accumulating Isracard cycle (latest month in DB)
      pool.query(`
        SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count
        FROM transactions
        WHERE ${ISRACARD_SPEND}
          AND to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') = (
            SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')
            FROM transactions WHERE source='isracard'
            ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
          )
      `),
      // Previous Isracard billing cycle
      pool.query(`
        SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count
        FROM transactions
        WHERE ${ISRACARD_SPEND}
          AND to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') = (
            SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')
            FROM transactions WHERE source='isracard'
            ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
            OFFSET 0
          )
          -- second distinct month
          AND to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') != (
            SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')
            FROM transactions WHERE source='isracard'
            ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
          )
      `),
      // Biggest single Isracard purchase ever
      pool.query(`
        SELECT business, amount_ils FROM transactions
        WHERE ${ISRACARD_SPEND} AND amount_ils IS NOT NULL
        ORDER BY amount_ils DESC LIMIT 1
      `),
      // Daily spending chart (30 days)
      pool.query(`
        SELECT date, SUM(amount_ils) as total
        FROM transactions
        WHERE to_date(date,'DD/MM/YYYY') >= NOW() - INTERVAL '30 days'
          AND ${ISRACARD_SPEND}
        GROUP BY date ORDER BY to_date(date,'DD/MM/YYYY') ASC
      `),
      // Category breakdown for current accumulating cycle
      pool.query(`
        SELECT COALESCE(category,'other') as category, COUNT(*) as count, COALESCE(SUM(amount_ils),0) as total
        FROM transactions
        WHERE ${ISRACARD_SPEND}
          AND to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') = (
            SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')
            FROM transactions WHERE source='isracard'
            ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
          )
        GROUP BY COALESCE(category,'other') ORDER BY total DESC
      `),
      // Next CC charge = current accumulating cycle details
      pool.query(`
        SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count,
               MIN(date) as from_date, MAX(date) as to_date
        FROM transactions
        WHERE ${ISRACARD_SPEND}
          AND to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY') = (
            SELECT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')
            FROM transactions WHERE source='isracard'
            ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
          )
      `),
      // Last salary from Discount
      pool.query(`
        SELECT amount_ils, date FROM transactions
        WHERE source='discount' AND charge_type='זיכוי' AND business ILIKE '%משכורת%'
        ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
      `),
      // Last Isracard charge hit (to derive next charge date)
      pool.query(`
        SELECT date, amount_ils FROM transactions
        WHERE source='discount' AND charge_type='חיוב' AND business ILIKE '%ישראכרט%'
        ORDER BY to_date(date,'DD/MM/YYYY') DESC LIMIT 1
      `),
      // Monthly fixed costs from Discount (mortgage, rent, loans)
      pool.query(`
        SELECT COALESCE(SUM(amount_ils),0) as total FROM transactions
        WHERE source='discount' AND charge_type='חיוב'
          AND date LIKE $1
          AND (business ILIKE '%טפחות%' OR business ILIKE '%משכנת%'
               OR business ILIKE '%שכירות%' OR business ILIKE '%פירעון הלוואה%'
               OR business ILIKE '%הע. ל%')
      `, [thisMonthPattern]),
    ]);

    // Derive next CC charge date: last charge date + 1 month
    let nextCCDate = null;
    if (lastCCRes.rows[0]?.date) {
      const [dd, mm2, yyyy2] = lastCCRes.rows[0].date.split('/');
      const d = new Date(`${yyyy2}-${mm2}-${dd}`);
      d.setMonth(d.getMonth() + 1);
      nextCCDate = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }

    res.json({
      // Current accumulating Isracard cycle (= next CC charge)
      thisMonth: {
        total: parseFloat(thisMonthRes.rows[0].total),
        count: parseInt(thisMonthRes.rows[0].count),
      },
      // Previous billed cycle
      lastMonth: { total: parseFloat(lastMonthRes.rows[0]?.total || 0) },
      biggest:   biggestRes.rows[0] || null,
      daily:     dailyRes.rows,
      categories: categoryRes.rows,
      nextCCCharge: {
        total:    parseFloat(nextCCRes.rows[0]?.total || 0),
        count:    parseInt(nextCCRes.rows[0]?.count  || 0),
        fromDate: nextCCRes.rows[0]?.from_date || null,
        toDate:   nextCCRes.rows[0]?.to_date   || null,
        chargeDate: nextCCDate,
      },
      bankSummary: {
        lastSalary: salaryRes.rows[0] ? {
          amount: parseFloat(salaryRes.rows[0].amount_ils),
          date:   salaryRes.rows[0].date,
        } : null,
        lastCCChargeDate:   lastCCRes.rows[0]?.date        || null,
        lastCCChargeAmount: lastCCRes.rows[0] ? parseFloat(lastCCRes.rows[0].amount_ils) : null,
        nextCCChargeDate:   nextCCDate,
        monthlyFixed:       parseFloat(fixedRes.rows[0]?.total || 0),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
