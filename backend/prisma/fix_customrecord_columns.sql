ALTER TABLE "CustomRecord"
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS created_by_broker_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_broker_id TEXT,
  ADD COLUMN IF NOT EXISTS module_type TEXT,
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'shared';

CREATE INDEX IF NOT EXISTS "CustomRecord_created_by_user_id_idx" ON "CustomRecord" (created_by_user_id);
CREATE INDEX IF NOT EXISTS "CustomRecord_created_by_broker_id_idx" ON "CustomRecord" (created_by_broker_id);
CREATE INDEX IF NOT EXISTS "CustomRecord_assigned_broker_id_idx" ON "CustomRecord" (assigned_broker_id);
CREATE INDEX IF NOT EXISTS "CustomRecord_module_type_idx" ON "CustomRecord" (module_type);
CREATE INDEX IF NOT EXISTS "CustomRecord_visibility_scope_idx" ON "CustomRecord" (visibility_scope);
