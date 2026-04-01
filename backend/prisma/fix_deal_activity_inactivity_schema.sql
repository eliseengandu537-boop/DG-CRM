ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS inactivity_notified_at TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Deal_last_activity_at_idx" ON "Deal" (last_activity_at);
CREATE INDEX IF NOT EXISTS "Deal_inactivity_notified_at_idx" ON "Deal" (inactivity_notified_at);

UPDATE "Deal"
SET last_activity_at = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE last_activity_at IS NULL;

CREATE TABLE IF NOT EXISTS "DealActivity" (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  broker_id TEXT NOT NULL,
  broker_name TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealActivity_deal_id_fkey"
    FOREIGN KEY (deal_id) REFERENCES "Deal"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DealActivity_deal_id_idx" ON "DealActivity" (deal_id);
CREATE INDEX IF NOT EXISTS "DealActivity_broker_id_idx" ON "DealActivity" (broker_id);
CREATE INDEX IF NOT EXISTS "DealActivity_created_at_idx" ON "DealActivity" (created_at);

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS sound BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;
