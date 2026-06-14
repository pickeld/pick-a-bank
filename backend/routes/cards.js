const router = require('express').Router();

router.get('/owners', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query('SELECT * FROM card_owners ORDER BY card_suffix');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/owners', async (req, res) => {
  try {
    const { card_suffix, owner_name, source = 'isracard' } = req.body;
    await req.app.locals.pool.query(
      `INSERT INTO card_owners (card_suffix, owner_name, source) VALUES ($1,$2,$3)
       ON CONFLICT (card_suffix) DO UPDATE SET owner_name=$2, source=$3`,
      [card_suffix, owner_name, source]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/owners/:suffix', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM card_owners WHERE card_suffix=$1', [req.params.suffix]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
