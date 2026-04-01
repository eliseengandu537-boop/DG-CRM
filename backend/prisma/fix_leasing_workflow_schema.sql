-- Adds missing schema pieces required for leasing + lead comment workflows.

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS comment TEXT;

CREATE TABLE IF NOT EXISTS landlords (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  details JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS landlords_name_idx ON landlords (name);
CREATE INDEX IF NOT EXISTS landlords_status_idx ON landlords (status);

CREATE TABLE IF NOT EXISTS industries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  occupancy_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  average_rent DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS industries_name_idx ON industries (name);
CREATE INDEX IF NOT EXISTS industries_status_idx ON industries (status);
