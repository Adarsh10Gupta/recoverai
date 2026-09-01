-- RecoverAI SaaS v2: secure Razorpay OAuth connections + partner-managed webhooks.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS razorpay_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mode VARCHAR(10) NOT NULL DEFAULT 'test',
  razorpay_account_id VARCHAR(100),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  public_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  webhook_id VARCHAR(100),
  webhook_secret_encrypted TEXT,
  webhook_url TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'test';
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS razorpay_account_id VARCHAR(100);
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS public_token_encrypted TEXT;
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(100);
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE razorpay_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS razorpay_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  state_hash VARCHAR(128) NOT NULL UNIQUE,
  mode VARCHAR(10) NOT NULL DEFAULT 'test',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS razorpay_account_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_workspace_mode ON razorpay_connections(workspace_id, mode);
CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_account_mode ON razorpay_connections(razorpay_account_id, mode) WHERE razorpay_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connections_workspace_mode ON razorpay_connections(workspace_id, mode);
CREATE INDEX IF NOT EXISTS idx_connections_account_mode ON razorpay_connections(razorpay_account_id, mode);
CREATE INDEX IF NOT EXISTS idx_oauth_states_workspace ON razorpay_oauth_states(workspace_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_webhook_account ON webhook_events(razorpay_account_id, received_at DESC);

CREATE OR REPLACE FUNCTION recoverai_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connections_updated ON razorpay_connections;
CREATE TRIGGER trg_connections_updated BEFORE UPDATE ON razorpay_connections
FOR EACH ROW EXECUTE FUNCTION recoverai_touch_updated_at();

-- Legacy v2 connection columns are retained for backward compatibility,
-- but new OAuth connections do not use them.
ALTER TABLE razorpay_connections ALTER COLUMN key_id DROP NOT NULL;
ALTER TABLE razorpay_connections ALTER COLUMN key_secret_encrypted DROP NOT NULL;
