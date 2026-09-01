-- RecoverAI v4: recovery intelligence + controlled automation
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS recovery_score INTEGER;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS recovery_probability INTEGER;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS recovery_confidence INTEGER;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS revenue_at_risk BIGINT NOT NULL DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS recommended_action VARCHAR(120);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS recommendation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_incidents_recovery_score ON incidents(workspace_id,recovery_score DESC) WHERE status='open';

CREATE TABLE IF NOT EXISTS automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  min_recovery_score INTEGER NOT NULL DEFAULT 75 CHECK (min_recovery_score BETWEEN 0 AND 100),
  mode VARCHAR(40) NOT NULL DEFAULT 'safe_reconcile',
  last_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  recovery_action_id UUID REFERENCES recovery_actions(id) ON DELETE SET NULL,
  mode VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL,
  score INTEGER,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_workspace ON automation_runs(workspace_id,created_at DESC);

CREATE OR REPLACE FUNCTION recoverai_automation_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_automation_settings_updated ON automation_settings;
CREATE TRIGGER trg_automation_settings_updated BEFORE UPDATE ON automation_settings
FOR EACH ROW EXECUTE FUNCTION recoverai_automation_updated();

INSERT INTO automation_settings(workspace_id)
SELECT id FROM workspaces
ON CONFLICT(workspace_id) DO NOTHING;
