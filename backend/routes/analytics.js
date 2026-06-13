const router = require('express').Router();

// Isracard semantics:
//   charge_type = 'זיכוי'  →  individual purchase transactions (actual spend)
//   charge_type = 'חיוב'   →  monthly billing events (NOT individual purchases)
// Discount semantics:
//   charge_type = 'חיוב'   →  bank account debits (outflows)
//   charge_type = 'זיכוי'  →  bank account credits (salary, refunds)

// ── helpers ───────────────────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split('/');
  return new Date(`${y}-${m}-${d}`);
}

function monthKey(str) {
  if (!str) return null;
  const parts = str.split('/');
  return `${parts[1]}/${parts[2]}`;
}

function fmt(n) {
  return Math.round(parseFloat(n) || 0);
}

// ── GET /api/analytics ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const { rows: all } = await pool.query(
      `SELECT id, source, date, business, amount_ils, charge_type, category, currency, country, scraped_at
       FROM transactions
       ORDER BY to_date(date,'DD/MM/YYYY') ASC, id ASC`
    );

    const now = new Date();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const thisMonthKey = `${mm}/${yyyy}`;

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const mmL   = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
    const yyyyL = lastMonthDate.getFullYear();
    const lastMonthKey = `${mmL}/${yyyyL}`;

    // ── 1. BANK STATUS (Discount net flow) ────────────────────────────────────
    const discountTxns = all.filter(t => t.source === 'discount');

    let discountNetFlow = 0, discountInflow = 0, discountOutflow = 0;
    const discountByMonth = {};

    for (const t of discountTxns) {
      const amt = fmt(t.amount_ils);
      const mk  = monthKey(t.date);
      if (!mk) continue;
      if (!discountByMonth[mk]) discountByMonth[mk] = { inflow: 0, outflow: 0 };
      if (t.charge_type === 'זיכוי') {
        discountNetFlow += amt; discountInflow += amt;
        discountByMonth[mk].inflow += amt;
      } else {
        discountNetFlow -= amt; discountOutflow += amt;
        discountByMonth[mk].outflow += amt;
      }
    }

    const discountMonthlyFlow = Object.entries(discountByMonth)
      .map(([month, v]) => ({ month, net: v.inflow - v.outflow, inflow: v.inflow, outflow: v.outflow }))
      .sort((a, b) => parseDate(`01/${a.month}`) - parseDate(`01/${b.month}`));

    // ── 2. ISRACARD SPEND (זיכוי = individual purchases, deduplicated) ────────
    const isracardSpend = all.filter(t => t.source === 'isracard' && t.charge_type === 'זיכוי');

    const thisMonthIsracard = isracardSpend
      .filter(t => monthKey(t.date) === thisMonthKey)
      .reduce((s, t) => s + fmt(t.amount_ils), 0);

    const recentMonths = [1, 2, 3].map(offset => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    });
    const recentSpends = recentMonths
      .map(mk => isracardSpend.filter(t => monthKey(t.date) === mk).reduce((s, t) => s + fmt(t.amount_ils), 0))
      .filter(v => v > 0);

    const avgMonthlySpend = recentSpends.length
      ? Math.round(recentSpends.reduce((a, b) => a + b, 0) / recentSpends.length)
      : 0;

    const daysInMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth    = now.getDate();
    const daysLeft      = daysInMonth - dayOfMonth;
    const dailyBurnRate = dayOfMonth > 0 ? Math.round(thisMonthIsracard / dayOfMonth) : 0;
    const projectedMonthEnd = thisMonthIsracard + (dailyBurnRate * daysLeft);

    // ── 3. RECURRING CHARGES ──────────────────────────────────────────────────
    // Group by business → count distinct months → if ≥2 with low variance → recurring
    const businessByMonth = {};
    for (const t of isracardSpend) {
      const mk  = monthKey(t.date);
      const key = t.business?.trim().toLowerCase();
      if (!mk || !key) continue;
      if (!businessByMonth[key]) businessByMonth[key] = { months: {}, name: t.business, category: t.category };
      if (!businessByMonth[key].months[mk]) businessByMonth[key].months[mk] = [];
      businessByMonth[key].months[mk].push(fmt(t.amount_ils));
    }

    const recurring = [];
    for (const stat of Object.values(businessByMonth)) {
      const monthList = Object.keys(stat.months);
      if (monthList.length < 2) continue;
      // Use max amount per month (avoid double-counting if same merchant charges twice in one month)
      const monthMaxAmounts = monthList.map(mk => Math.max(...stat.months[mk]));
      const avg = monthMaxAmounts.reduce((a, b) => a + b, 0) / monthMaxAmounts.length;
      if (avg < 10) continue;
      const maxDev = Math.max(...monthMaxAmounts.map(a => Math.abs(a - avg) / (avg || 1)));
      if (maxDev > 0.3) continue;
      recurring.push({
        business:   stat.name,
        category:   stat.category || null,
        monthCount: monthList.length,
        avgAmount:  Math.round(avg),
        lastMonth:  monthList.sort((a, b) => parseDate(`01/${b}`) - parseDate(`01/${a}`))[0],
      });
    }
    recurring.sort((a, b) => b.avgAmount - a.avgAmount);
    const recurringTotal = recurring.reduce((s, r) => s + r.avgAmount, 0);

    // ── 4. 6-MONTH TREND ─────────────────────────────────────────────────────
    const sixMonthTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mk = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      sixMonthTrend.push({
        month: mk,
        total: isracardSpend.filter(t => monthKey(t.date) === mk).reduce((s, t) => s + fmt(t.amount_ils), 0),
      });
    }

    // ── 5. CATEGORY TREND ────────────────────────────────────────────────────
    const CATEGORIES = [
      'dining','groceries','household','transport','travel','shopping',
      'health','telecom','entertainment','finance','kids','pets','personal',
      'rent','transfers','other',
    ];

    const categoryTrend = CATEGORIES.map(cat => {
      const match = t => t.category === cat || (!t.category && cat === 'other');
      const thisM = isracardSpend.filter(t => monthKey(t.date) === thisMonthKey && match(t)).reduce((s, t) => s + fmt(t.amount_ils), 0);
      const lastM = isracardSpend.filter(t => monthKey(t.date) === lastMonthKey && match(t)).reduce((s, t) => s + fmt(t.amount_ils), 0);
      const threeMonthAmounts = [1, 2, 3].map(offset => {
        const d  = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const mk = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        return isracardSpend.filter(t => monthKey(t.date) === mk && match(t)).reduce((s, t) => s + fmt(t.amount_ils), 0);
      });
      const avg3 = Math.round(threeMonthAmounts.reduce((a, b) => a + b, 0) / 3);
      return { category: cat, thisMonth: thisM, lastMonth: lastM, avg3Month: avg3 };
    }).filter(c => c.thisMonth > 0 || c.lastMonth > 0 || c.avg3Month > 0);

    // ── 6. ANOMALIES ─────────────────────────────────────────────────────────
    const anomalies = [];

    // 6a. Unusual amount per merchant (z-score > 2.5, amount > 1.5× mean, ≥3 historical occurrences)
    const merchantStats = {};
    for (const t of isracardSpend) {
      const key = t.business?.trim().toLowerCase();
      if (!key) continue;
      if (!merchantStats[key]) merchantStats[key] = { amounts: [], name: t.business };
      merchantStats[key].amounts.push({ id: t.id, date: t.date, amt: fmt(t.amount_ils) });
    }
    for (const stat of Object.values(merchantStats)) {
      if (stat.amounts.length < 3) continue;
      const vals = stat.amounts.map(a => a.amt);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std  = Math.sqrt(vals.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / vals.length);
      if (std === 0) continue;
      for (const entry of stat.amounts) {
        const z = (entry.amt - mean) / std;
        if (z > 2.5 && entry.amt > mean * 1.5) {
          anomalies.push({
            type: 'unusual_amount',
            severity: z > 4 ? 'high' : 'medium',
            txnId: entry.id,
            date: entry.date,
            business: stat.name,
            amount: entry.amt,
            meanAmount: Math.round(mean),
            zScore: Math.round(z * 10) / 10,
            message: `חיוב חריג: ₪${entry.amt.toLocaleString()} לעומת ממוצע ₪${Math.round(mean).toLocaleString()} אצל ${stat.name}`,
          });
        }
      }
    }

    // 6b. Category spike: this month > 1.5× 3-month avg (min ₪200 baseline)
    for (const c of categoryTrend) {
      if (c.avg3Month < 200) continue;
      if (c.thisMonth > c.avg3Month * 1.5 && c.thisMonth - c.avg3Month > 300) {
        anomalies.push({
          type: 'category_spike',
          severity: c.thisMonth > c.avg3Month * 2 ? 'high' : 'medium',
          category: c.category,
          thisMonth: c.thisMonth,
          avg3Month: c.avg3Month,
          pctIncrease: Math.round(((c.thisMonth - c.avg3Month) / c.avg3Month) * 100),
          message: `עלייה חדה בקטגוריה — החודש: ₪${c.thisMonth.toLocaleString()} (ממוצע 3 חודשים: ₪${c.avg3Month.toLocaleString()})`,
        });
      }
    }

    // 6c. Duplicate suspect: same business + similar amount within 3 days,
    //     BUT only across DIFFERENT billing months (same month = expected recurring charge).
    //     Exact same (date, business, amount) = scraper double → already removed by dedupe().
    //     Here we catch: same merchant charged twice within 3 days in DIFFERENT months.
    const sortedSpend = [...isracardSpend].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const seenPairs   = new Set();
    for (let i = 0; i < sortedSpend.length; i++) {
      for (let j = i + 1; j < sortedSpend.length; j++) {
        const a = sortedSpend[i];
        const b = sortedSpend[j];
        const diff = (parseDate(b.date) - parseDate(a.date)) / 86400000;
        if (diff > 3) break;
        // Skip if same billing month — that's just a recurring charge (e.g. monthly insurance)
        if (monthKey(a.date) === monthKey(b.date)) continue;
        const pairKey = [a.id, b.id].sort().join('-');
        if (seenPairs.has(pairKey)) continue;
        if (
          a.business?.trim().toLowerCase() === b.business?.trim().toLowerCase() &&
          Math.abs(fmt(a.amount_ils) - fmt(b.amount_ils)) <= 1 &&
          a.id !== b.id
        ) {
          seenPairs.add(pairKey);
          anomalies.push({
            type: 'duplicate_suspect',
            severity: 'medium',
            txnIds: [a.id, b.id],
            date: b.date,
            business: b.business,
            amount: fmt(b.amount_ils),
            daysDiff: Math.round(diff * 10) / 10,
            message: `חיוב כפול אפשרי: ${b.business} — ₪${fmt(b.amount_ils).toLocaleString()} פעמיים תוך ${diff < 1 ? 'אותו יום' : Math.round(diff) + ' ימים'} (חודשים שונים)`,
          });
        }
      }
    }

    // 6d. International transactions (country field non-empty)
    // Note: Isracard currency is always Hebrew "שקל חדש" regardless of country — country is the signal
    const international = all.filter(t =>
      t.source === 'isracard' &&
      t.country && t.country.trim() !== ''
    );
    for (const t of international) {
      anomalies.push({
        type: 'foreign_transaction',
        severity: 'low',
        txnId: t.id,
        date: t.date,
        business: t.business,
        amount: fmt(t.amount_ils),
        country: t.country,
        message: `עסקה בחו"ל: ${t.business} — ${t.country}`,
      });
    }

    // 6e. Large single transaction: top 3% by amount, min ₪2000
    const amountsSorted = isracardSpend.map(t => fmt(t.amount_ils)).filter(a => a > 0).sort((a, b) => a - b);
    const p97 = amountsSorted[Math.floor(amountsSorted.length * 0.97)] || 0;
    if (p97 >= 2000) {
      const alreadyFlagged = new Set(anomalies.filter(a => a.txnId).map(a => a.txnId));
      for (const t of isracardSpend) {
        if (fmt(t.amount_ils) >= p97 && !alreadyFlagged.has(t.id)) {
          anomalies.push({
            type: 'large_transaction',
            severity: 'low',
            txnId: t.id,
            date: t.date,
            business: t.business,
            amount: fmt(t.amount_ils),
            category: t.category,
            message: `חיוב גדול במיוחד: ₪${fmt(t.amount_ils).toLocaleString()} — ${t.business}`,
          });
        }
      }
    }

    // Sort: high → medium → low, then newest first
    const severityOrder = { high: 0, medium: 1, low: 2 };
    anomalies.sort((a, b) => {
      const sd = (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
      if (sd !== 0) return sd;
      return (parseDate(b.date) || 0) - (parseDate(a.date) || 0);
    });

    res.json({
      bankStatus: {
        discountNetFlow,
        discountInflow,
        discountOutflow,
        discountMonthlyFlow,
        thisMonthIsracard,
        avgMonthlySpend,
        dailyBurnRate,
      },
      forecast: {
        projectedMonthEnd,
        daysLeft,
        dayOfMonth,
        daysInMonth,
        recurringCharges: recurring,
        recurringTotal,
        thisMonthIsracard,
      },
      trend: {
        sixMonth: sixMonthTrend,
        byCategory: categoryTrend,
      },
      anomalies,
      meta: {
        totalTransactions: all.length,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error('[analytics]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
