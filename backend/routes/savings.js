const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM savings_goals WHERE user_id=$1 ORDER BY created_at DESC', [req.user.sub]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, target_amount, current_amount, target_date, color } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, color)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.sub, name, target_amount, current_amount || 0, target_date, color || '#3b82f6']
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, target_amount, current_amount, target_date, color } = req.body;
    await req.app.locals.pool.query(
      `UPDATE savings_goals SET name=$1, target_amount=$2, current_amount=$3, target_date=$4, color=$5
       WHERE id=$6 AND user_id=$7`,
      [name, target_amount, current_amount, target_date, color, req.params.id, req.user.sub]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM savings_goals WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
