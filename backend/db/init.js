async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      avatar TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

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
      openai_key TEXT,
      notify_new_transactions BOOLEAN DEFAULT false,
      notify_daily_digest BOOLEAN DEFAULT false,
      push_subscription JSONB,
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

    CREATE TABLE IF NOT EXISTS card_owners (
      id SERIAL PRIMARY KEY,
      card_suffix TEXT NOT NULL UNIQUE,
      owner_name TEXT NOT NULL,
      source TEXT DEFAULT 'isracard'
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id SERIAL PRIMARY KEY,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      UNIQUE(month, category)
    );

    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ils_amount NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS foreign_currency TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_locked BOOLEAN DEFAULT false;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_num INTEGER;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_payments INTEGER;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS openai_key TEXT;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_new_transactions BOOLEAN DEFAULT false;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_daily_digest BOOLEAN DEFAULT false;
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS push_subscription JSONB;

    CREATE INDEX IF NOT EXISTS idx_transactions_date   ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
  `);
  console.log('[db] schema ready');
}

module.exports = { initDb };
