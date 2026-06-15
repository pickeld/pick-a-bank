const router = require('express').Router();

// GET /api/recurring — detect recurring payments from transaction history
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.user.sub;

    // Find businesses that appear in 2+ distinct months with similar amounts
    const { rows } = await pool.query(`
      SELECT
        LOWER(TRIM(business)) as business_key,
        MAX(business) as business,
        MAX(category) as category,
        COUNT(DISTINCT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')) as month_count,
        ROUND(AVG(amount_ils)::numeric, 0) as avg_amount,
        MIN(amount_ils) as min_amount,
        MAX(amount_ils) as max_amount,
        MAX(date) as last_date,
        COUNT(*) as total_occurrences
      FROM transactions
      WHERE user_id=$1
        AND source='isracard' AND charge_type='זיכוי'
        AND amount_ils > 5
      GROUP BY LOWER(TRIM(business))
      HAVING COUNT(DISTINCT to_char(to_date(date,'DD/MM/YYYY'),'MM/YYYY')) >= 2
        AND (MAX(amount_ils) - MIN(amount_ils)) / NULLIF(AVG(amount_ils), 0) < 0.3
      ORDER BY avg_amount DESC
      LIMIT 50
    `, [userId]);

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
