const router = require('express').Router();
const multer = require('multer');
const XLSX   = require('xlsx');
const { categorize } = require('../lib/categorize');

// ── multer — memory storage, max 10MB ────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── helpers ───────────────────────────────────────────────────────────────────

// Normalise a Hebrew date string to DD/MM/YYYY
function normaliseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  // Excel serial date (number)
  const n = Number(s);
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) {
      const dd = String(d.d).padStart(2, '0');
      const mm = String(d.m).padStart(2, '0');
      return `${dd}/${mm}/${d.y}`;
    }
  }
  // DD/MM/YY → DD/MM/20YY
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${d}/${m}/20${y}`;
  }
  return s;
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseFloat(String(raw).replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

// ── Isracard Excel parser ─────────────────────────────────────────────────────
// Isracard exports: .xlsx  (Windows-1255 inside zip, but xlsx handles it)
// Typical column names (row 1 is often a title, row 2 are headers):
//   תאריך עסקה | תאריך חיוב | שם בית עסק | ענף | סכום עסקה | מטבע | סכום לחיוב בש"ח | הערות
// Some exports have slight variations — we match by contains.
function parseIsracardXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', codepage: 1255 });
  const txns = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find the header row — look for a row containing "שם בית עסק" or "בית עסק"
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i].map(c => String(c).trim());
      if (row.some(c => c.includes('בית עסק') || c.includes('שם העסק'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) continue;

    const headers = rows[headerIdx].map(c => String(c).trim());

    // Map column indices by partial Hebrew match
    const col = (keyword) => headers.findIndex(h => h.includes(keyword));

    const iDate        = col('תאריך עסקה') !== -1 ? col('תאריך עסקה') : col('תאריך');
    const iBusiness    = col('שם בית עסק') !== -1 ? col('שם בית עסק') : col('בית עסק');
    const iAmountFgn   = col('סכום עסקה');   // original currency amount
    const iCurrency    = col('מטבע');
    const iAmountIls   = col('סכום לחיוב'); // ILS billed amount
    const iNote        = col('הערות');
    const iCardNum     = col('4 ספרות');    // card last 4 digits (sometimes present)

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => c === '' || c === null)) continue;

      const date     = normaliseDate(row[iDate]);
      const business = String(row[iBusiness] || '').trim();
      if (!date || !business) continue;

      const amountFgn = iAmountFgn !== -1 ? parseAmount(row[iAmountFgn]) : null;
      const currency  = iCurrency !== -1  ? String(row[iCurrency] || '').trim() : null;
      const amountIls = iAmountIls !== -1 ? parseAmount(row[iAmountIls]) : null;
      const note      = iNote !== -1      ? String(row[iNote] || '').trim()  : null;
      const card      = iCardNum !== -1   ? String(row[iCardNum] || '').trim() : null;

      // Use ILS amount if available, else fallback to foreign amount
      const amount = amountIls ?? amountFgn;
      if (amount === null) continue;

      const ilsCurrencies = new Set(['ש"ח', 'שח', 'שקל', 'ILS', 'NIS', '']);
      const isIls = !currency || ilsCurrencies.has(currency);

      txns.push({
        date,
        business,
        description:     note || null,
        amountILS:       amountIls ?? (isIls ? amountFgn : null),
        foreignAmount:   !isIls ? amountFgn : null,
        foreignCurrency: !isIls ? currency  : null,
        currency:        currency || 'שקל חדש',
        chargeType:      'זיכוי',   // Isracard exports are always purchases
        card:            card || null,
        confirmation:    null,
      });
    }
  }

  return txns;
}

// ── Discount Bank CSV/Excel parser ────────────────────────────────────────────
// Discount exports: .xlsx or .csv (UTF-8 or Windows-1255)
// Columns: תאריך | תיאור פעולה | מספר אסמכתא | חובה | זכות | יתרה
function parseDiscountFile(buffer, mimetype) {
  let rows;

  const isXlsx = mimetype && (mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype.includes('xlsx'));

  if (isXlsx) {
    const wb = XLSX.read(buffer, { type: 'buffer', codepage: 1255 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } else {
    // CSV — try UTF-8 first, then Windows-1255
    let text = buffer.toString('utf8');
    if (text.includes('�') || !text.includes('תאריך')) {
      text = buffer.toString('latin1');
    }
    rows = text.split('\n').map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
  }

  const txns = [];

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(c => String(c).trim());
    if (row.some(c => c.includes('תיאור פעולה') || c.includes('תיאור'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return txns;

  const headers = rows[headerIdx].map(c => String(c).trim());
  const col = (keyword) => headers.findIndex(h => h.includes(keyword));

  const iDate    = col('תאריך');
  const iDesc    = col('תיאור');
  const iRef     = col('אסמכתא');
  const iDebit   = col('חובה');
  const iCredit  = col('זכות');

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => c === '' || c === null)) continue;

    const date     = normaliseDate(row[iDate]);
    const business = String(row[iDesc] || '').trim();
    if (!date || !business) continue;

    const debit  = iDebit  !== -1 ? parseAmount(row[iDebit])  : null;
    const credit = iCredit !== -1 ? parseAmount(row[iCredit]) : null;

    const isDebit   = debit  !== null && debit  > 0;
    const isCredit  = credit !== null && credit > 0;
    if (!isDebit && !isCredit) continue;

    const amount     = isDebit ? debit : credit;
    const chargeType = isDebit ? 'חיוב' : 'זיכוי';
    const ref        = iRef !== -1 ? String(row[iRef] || '').trim() : null;

    txns.push({
      date,
      business,
      description:     null,
      amountILS:       amount,
      foreignAmount:   null,
      foreignCurrency: null,
      currency:        'ILS',
      chargeType,
      card:            null,
      confirmation:    ref || null,
    });
  }

  return txns;
}

// ── Upsert helper ─────────────────────────────────────────────────────────────
async function upsert(pool, source, txns) {
  let inserted = 0, skipped = 0;
  for (const t of txns) {
    const amountIls = t.amountILS ?? t.foreignAmount;
    if (!amountIls) { skipped++; continue; }

    const confirmation = t.confirmation ||
      `${t.date}-${(t.business || '').trim().slice(0, 30)}-${amountIls}`;

    const category = categorize(t.business);

    try {
      const res = await pool.query(
        `INSERT INTO transactions
           (source, date, business, description, amount_ils, ils_amount,
            foreign_amount, foreign_currency,
            currency, currency_symbol, card, charge_type, confirmation,
            category, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (source, confirmation, date, business, amount_ils) DO NOTHING
         RETURNING id`,
        [
          source,
          t.date,
          t.business,
          t.description || null,
          amountIls,
          t.amountILS ?? amountIls,
          t.foreignAmount   ?? null,
          t.foreignCurrency ?? null,
          t.currency || 'ILS',
          '₪',
          t.card || null,
          t.chargeType || 'זיכוי',
          confirmation,
          category || null,
          JSON.stringify(t),
        ]
      );
      if (res.rows.length) inserted++; else skipped++;
    } catch (_) { skipped++; }
  }
  return { inserted, skipped };
}

// ── POST /api/import ──────────────────────────────────────────────────────────
// Body: multipart/form-data  { file, source: 'isracard' | 'discount' }
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const pool   = req.app.locals.pool;
    const source = req.body?.source;
    const file   = req.file;

    if (!file)   return res.status(400).json({ error: 'No file uploaded' });
    if (!source) return res.status(400).json({ error: 'source is required (isracard | discount)' });

    let txns;
    if (source === 'isracard') {
      txns = parseIsracardXlsx(file.buffer);
    } else if (source === 'discount') {
      txns = parseDiscountFile(file.buffer, file.mimetype);
    } else {
      return res.status(400).json({ error: `Unknown source: ${source}` });
    }

    if (!txns.length) {
      return res.status(422).json({ error: 'Could not parse any transactions from the file. Check column headers.' });
    }

    const result = await upsert(pool, source, txns);
    res.json({ ok: true, parsed: txns.length, ...result });
  } catch (e) {
    console.error('[import]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/import/preview — parse only, no DB write ────────────────────────
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    const source = req.body?.source;
    const file   = req.file;

    if (!file)   return res.status(400).json({ error: 'No file uploaded' });
    if (!source) return res.status(400).json({ error: 'source required' });

    let txns;
    if (source === 'isracard') {
      txns = parseIsracardXlsx(file.buffer);
    } else if (source === 'discount') {
      txns = parseDiscountFile(file.buffer, file.mimetype);
    } else {
      return res.status(400).json({ error: `Unknown source: ${source}` });
    }

    // Return first 20 rows for preview
    res.json({ parsed: txns.length, preview: txns.slice(0, 20) });
  } catch (e) {
    console.error('[import/preview]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
