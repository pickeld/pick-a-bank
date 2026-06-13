async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      isracard_id TEXT,
      isracard_card6 TEXT,
      isracard_password TEXT,
      discount_id TEXT,
      discount_password TEXT,
      discount_num TEXT,
      scrape_interval_hours INTEGER DEFAULT 6,
      last_scrape TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      date TEXT,
      business TEXT,
      description TEXT,
      amount_ils NUMERIC,
      ils_amount NUMERIC,
      foreign_amount NUMERIC,
      foreign_currency TEXT,
      currency TEXT DEFAULT 'ILS',
      currency_symbol TEXT DEFAULT '₪',
      type TEXT,
      country TEXT,
      card TEXT,
      charge_type TEXT,
      confirmation TEXT,
      raw JSONB,
      scraped_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source, confirmation, date, business, amount_ils)
    );

    -- Add new columns to existing tables if missing (idempotent)
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ils_amount NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS foreign_currency TEXT;

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
  `);
  console.log('[db] schema ready');
}

module.exports = { initDb };
