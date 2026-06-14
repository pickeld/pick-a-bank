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
