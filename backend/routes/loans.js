const router = require('express').Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM loans WHERE user_id=$1 ORDER BY created_at DESC', [req.user.sub]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { loan_name, account_number, original_amount, remaining_balance, interest_rate,
            next_payment_amount, next_payment_date, remaining_payments, loan_type, repayment_method } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO loans (user_id, loan_name, account_number, original_amount, remaining_balance,
        interest_rate, next_payment_amount, next_payment_date, remaining_payments, loan_type, repayment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.sub, loan_name, account_number, original_amount, remaining_balance,
       interest_rate, next_payment_amount, next_payment_date, remaining_payments, loan_type, repayment_method]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { loan_name, remaining_balance, next_payment_amount, next_payment_date, remaining_payments } = req.body;
    await req.app.locals.pool.query(
      `UPDATE loans SET loan_name=$1, remaining_balance=$2, next_payment_amount=$3,
        next_payment_date=$4, remaining_payments=$5, updated_at=NOW()
       WHERE id=$6 AND user_id=$7`,
      [loan_name, remaining_balance, next_payment_amount, next_payment_date, remaining_payments, req.params.id, req.user.sub]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM loans WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
