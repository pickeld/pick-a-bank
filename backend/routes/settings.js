const router = require('express').Router();

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query('SELECT * FROM settings LIMIT 1');
    if (!rows.length) return res.json(null);
    const s = rows[0];
    // mask passwords
    res.json({
      ...s,
      isracard_password: s.isracard_password ? '••••••••' : '',
      discount_password: s.discount_password ? '••••••••' : '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/settings  (upsert)
router.post('/', async (req, res) => {
  try {
    const {
      isracard_id, isracard_card6, isracard_password,
      discount_id, discount_password, discount_num,
      scrape_interval_hours,
    } = req.body;

    const pool = req.app.locals.pool;
    const { rows: existing } = await pool.query('SELECT id FROM settings LIMIT 1');

    if (existing.length) {
      // Only update password fields if they're not the masked placeholder
      const updates = {
        isracard_id, isracard_card6,
        discount_id, discount_num,
        scrape_interval_hours: scrape_interval_hours || 6,
        updated_at: new Date(),
      };
      if (isracard_password && isracard_password !== '••••••••') updates.isracard_password = isracard_password;
      if (discount_password && discount_password !== '••••••••') updates.discount_password = discount_password;

      const keys = Object.keys(updates);
      const vals = Object.values(updates);
      const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await pool.query(
        `UPDATE settings SET ${setClauses} WHERE id = $${keys.length + 1}`,
        [...vals, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO settings (isracard_id, isracard_card6, isracard_password, discount_id, discount_password, discount_num, scrape_interval_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [isracard_id, isracard_card6, isracard_password, discount_id, discount_password, discount_num, scrape_interval_hours || 6]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
