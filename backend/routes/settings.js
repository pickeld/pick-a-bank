const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user.sub;
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM settings WHERE user_id=$1 LIMIT 1', [userId]
    );
    if (!rows.length) return res.json(null);
    const s = rows[0];
    res.json({
      ...s,
      isracard_password: s.isracard_password ? '••••••••' : '',
      discount_password: s.discount_password ? '••••••••' : '',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/credentials', async (req, res) => {
  try {
    const userId = req.user.sub;
    const { rows } = await req.app.locals.pool.query(
      'SELECT isracard_id, isracard_card6, isracard_password, discount_id, discount_password, discount_num FROM settings WHERE user_id=$1 LIMIT 1',
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No settings found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      isracard_id, isracard_card6, isracard_password,
      discount_id, discount_password, discount_num,
      scrape_interval_hours, scrape_time, scrape_timezone, digest_interval_hours, openai_key,
      notify_new_transactions, notify_daily_digest,
    } = req.body;

    const pool = req.app.locals.pool;
    const { rows: existing } = await pool.query(
      'SELECT id FROM settings WHERE user_id=$1 LIMIT 1', [userId]
    );

    if (existing.length) {
      const updates = {
        isracard_id, isracard_card6,
        discount_id, discount_num,
        scrape_interval_hours: scrape_interval_hours || 6,
        scrape_time: scrape_time || '08:00',
        scrape_timezone: scrape_timezone || 'Asia/Jerusalem',
        digest_interval_hours: digest_interval_hours || 24,
        openai_key: openai_key || null,
        notify_new_transactions: !!notify_new_transactions,
        notify_daily_digest: !!notify_daily_digest,
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
        `INSERT INTO settings
           (user_id, isracard_id, isracard_card6, isracard_password,
            discount_id, discount_password, discount_num, scrape_interval_hours, scrape_time, scrape_timezone,
            openai_key, notify_new_transactions, notify_daily_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [userId, isracard_id, isracard_card6, isracard_password,
         discount_id, discount_password, discount_num, scrape_interval_hours || 6, scrape_time || '08:00', scrape_timezone || 'Asia/Jerusalem',
         scrape_time || '08:00', scrape_timezone || 'Asia/Jerusalem',
         openai_key || null, !!notify_new_transactions, !!notify_daily_digest]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
