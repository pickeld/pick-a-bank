const router = require('express').Router();

// GET /api/push/devices — list all subscribed devices for this user
router.get('/devices', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT id, device_name, endpoint, created_at FROM push_subscriptions WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/push/subscribe — register this device
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, device_name } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'subscription required' });
    const name = (device_name || '').trim() || 'מכשיר לא ידוע';
    await req.app.locals.pool.query(
      `INSERT INTO push_subscriptions (user_id, device_name, endpoint, subscription)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET device_name=$2, subscription=$4`,
      [req.user.sub, name, subscription.endpoint, JSON.stringify(subscription)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/push/devices/:id — remove a specific device
router.delete('/devices/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query(
      'DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.sub]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/push/test — send a test notification to ALL devices of this user
router.post('/test', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT id, device_name FROM push_subscriptions WHERE user_id=$1',
      [req.user.sub]
    );
    if (!rows.length) return res.status(400).json({ error: 'no_devices', message: 'אין מכשירים רשומים — הפעל התראות תחילה' });

    // Fire native browser notification via ServiceWorker (client-side)
    // Server just confirms devices exist; actual notification fired from frontend
    res.json({ ok: true, devices: rows.length, message: `שולח התראת בדיקה ל-${rows.length} מכשיר/ים` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy endpoints kept for compatibility
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await req.app.locals.pool.query(
        'DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',
        [req.user.sub, endpoint]
      );
    } else {
      await req.app.locals.pool.query(
        'DELETE FROM push_subscriptions WHERE user_id=$1',
        [req.user.sub]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// GET /api/push/pending — returns pending digest if due (for frontend polling)
router.get('/pending', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const userId = req.user.sub;
    const { rows } = await pool.query(
      'SELECT notify_daily_digest, digest_interval_hours, last_digest FROM settings WHERE user_id=$1 LIMIT 1',
      [userId]
    );
    if (!rows.length || !rows[0].notify_daily_digest) return res.json({ pending: false });

    const s = rows[0];
    const now = new Date();
    const lastDigest = s.last_digest ? new Date(s.last_digest) : null;
    const intervalMs = (s.digest_interval_hours || 24) * 3600000;
    if (lastDigest && (now - lastDigest) < intervalMs) return res.json({ pending: false });

    // Build digest
    const { rows: stats } = await pool.query(
      `SELECT COALESCE(SUM(amount_ils),0) as total, COUNT(*) as count
       FROM transactions
       WHERE user_id=$1 AND source='isracard' AND charge_type='זיכוי'
         AND to_date(date,'DD/MM/YYYY') >= NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    const total = parseFloat(stats[0]?.total || 0);
    const count = parseInt(stats[0]?.count || 0);
    const body = count > 0
      ? `${count} פעולות ב-24 שעות האחרונות · סה"כ ₪${total.toLocaleString('he-IL', {maximumFractionDigits:0})}`
      : 'אין פעולות חדשות ב-24 שעות האחרונות';

    // Mark as sent
    await pool.query('UPDATE settings SET last_digest=NOW() WHERE user_id=$1', [userId]);

    res.json({ pending: true, title: 'Pick a Bank 🏦', body });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
