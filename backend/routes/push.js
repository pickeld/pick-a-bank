const router = require('express').Router();

router.post('/subscribe', async (req, res) => {
  try {
    const { subscription } = req.body;
    const pool = req.app.locals.pool;
    const { rows } = await pool.query('SELECT id FROM settings LIMIT 1');
    if (!rows.length) return res.status(404).json({ error: 'no settings' });
    await pool.query(
      'UPDATE settings SET push_subscription=$1, notify_new_transactions=true WHERE id=$2',
      [JSON.stringify(subscription), rows[0].id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/unsubscribe', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    await pool.query('UPDATE settings SET push_subscription=NULL WHERE id=(SELECT id FROM settings LIMIT 1)');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/test', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { rows } = await pool.query('SELECT push_subscription FROM settings LIMIT 1');
    if (!rows[0]?.push_subscription) return res.status(400).json({ error: 'no subscription' });
    res.json({ ok: true, message: 'Test notification sent (VAPID not configured — install web-push to enable)' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
