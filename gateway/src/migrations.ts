// Ocula schema. Privacy: no face images are ever stored — only numeric measurements.
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hashed_password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','manager','staff')),
  store_id INTEGER REFERENCES stores(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT,
  phone TEXT,
  age INTEGER,
  is_child BOOLEAN NOT NULL DEFAULT false,
  guardian_phone TEXT,
  school_class TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);
CREATE TABLE IF NOT EXISTS camps (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  school TEXT NOT NULL,
  teacher TEXT NOT NULL DEFAULT '',
  store_id INTEGER REFERENCES stores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS screening_sessions (
  id TEXT PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id),
  customer_id INTEGER REFERENCES customers(id),
  camp_id INTEGER REFERENCES camps(id),
  mode TEXT NOT NULL DEFAULT 'adult',
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'active',
  consent_at TIMESTAMPTZ,
  calibration JSONB NOT NULL DEFAULT '{}'::jsonb,
  interview JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  tests JSONB NOT NULL DEFAULT '{}'::jsonb,
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence REAL,
  referral_level TEXT,
  ruleset_version TEXT,
  purchased BOOLEAN,
  purchased_sku TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_created_idx ON screening_sessions(created_at);
CREATE INDEX IF NOT EXISTS sessions_customer_idx ON screening_sessions(customer_id);
CREATE INDEX IF NOT EXISTS sessions_camp_idx ON screening_sessions(camp_id);
CREATE TABLE IF NOT EXISTS catalog_items (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  family TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lens_index REAL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_inr REAL,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`,
  },
];
