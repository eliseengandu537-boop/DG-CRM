ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS broker_id TEXT,
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS previous_values JSONB,
  ADD COLUMN IF NOT EXISTS next_values JSONB;

CREATE INDEX IF NOT EXISTS "AuditLog_broker_id_idx" ON "AuditLog" (broker_id);
CREATE INDEX IF NOT EXISTS "AuditLog_visibility_scope_idx" ON "AuditLog" (visibility_scope);

CREATE TABLE IF NOT EXISTS "Notification" (
  id TEXT PRIMARY KEY,
  activity_id TEXT UNIQUE,
  actor_user_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  broker_id TEXT,
  visibility_scope TEXT NOT NULL DEFAULT 'shared',
  payload JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_activity_id_fkey"
    FOREIGN KEY (activity_id) REFERENCES "AuditLog"(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Notification_actor_user_id_fkey"
    FOREIGN KEY (actor_user_id) REFERENCES "User"(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Notification_entity_type_idx" ON "Notification" (entity_type);
CREATE INDEX IF NOT EXISTS "Notification_entity_id_idx" ON "Notification" (entity_id);
CREATE INDEX IF NOT EXISTS "Notification_broker_id_idx" ON "Notification" (broker_id);
CREATE INDEX IF NOT EXISTS "Notification_visibility_scope_idx" ON "Notification" (visibility_scope);
CREATE INDEX IF NOT EXISTS "Notification_created_at_idx" ON "Notification" (created_at);

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS sound BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;
