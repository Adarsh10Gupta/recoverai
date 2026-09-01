CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL UNIQUE,
  plan VARCHAR(30) NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS razorpay_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL DEFAULT 'Razorpay',
  key_id VARCHAR(255) NOT NULL,
  key_secret_encrypted TEXT NOT NULL,
  webhook_secret_encrypted TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE recovery_actions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_workspace ON orders(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON payments(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_workspace ON webhook_events(workspace_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON incidents(workspace_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_workspace ON recovery_actions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connections_workspace ON razorpay_connections(workspace_id);

INSERT INTO workspaces (name, slug)
SELECT 'RecoverAI Demo', 'demo'
WHERE NOT EXISTS (SELECT 1 FROM workspaces);

UPDATE orders SET workspace_id=(SELECT id FROM workspaces ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE payments SET workspace_id=(SELECT id FROM workspaces ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE webhook_events SET workspace_id=(SELECT id FROM workspaces ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE incidents SET workspace_id=(SELECT id FROM workspaces ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE recovery_actions SET workspace_id=(SELECT id FROM workspaces ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;
UPDATE audit_logs SET workspace_id=(SELECT id FROM workspaces ORDER BY created_at LIMIT 1) WHERE workspace_id IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workspaces_updated ON workspaces;
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_connections_updated ON razorpay_connections;
CREATE TRIGGER trg_connections_updated BEFORE UPDATE ON razorpay_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
