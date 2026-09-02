-- RecoverAI v4.1: policy, payment-link recovery, abandonment detection and proof lab.
ALTER TABLE recovery_actions
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recovery_actions_order
ON recovery_actions(order_id);

CREATE TABLE IF NOT EXISTS recovery_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  max_retries INTEGER NOT NULL DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 10),
  cooldown_minutes INTEGER NOT NULL DEFAULT 30 CHECK (cooldown_minutes BETWEEN 0 AND 1440),
  auto_recover_score INTEGER NOT NULL DEFAULT 75 CHECK (auto_recover_score BETWEEN 0 AND 100),
  human_approval_amount NUMERIC(14,2) NOT NULL DEFAULT 10000,
  stop_on_chargeback BOOLEAN NOT NULL DEFAULT TRUE,
  abandonment_minutes INTEGER NOT NULL DEFAULT 20 CHECK (abandonment_minutes BETWEEN 5 AND 1440),
  payment_link_expiry_minutes INTEGER NOT NULL DEFAULT 60 CHECK (payment_link_expiry_minutes BETWEEN 5 AND 4320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  razorpay_payment_link_id VARCHAR(100) NOT NULL UNIQUE,
  reference_id VARCHAR(100) NOT NULL UNIQUE,
  short_url TEXT,
  amount_in_subunits BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'created',
  expires_at TIMESTAMPTZ,
  channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
  queued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_links_workspace ON payment_links(workspace_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_incident ON payment_links(incident_id,created_at DESC);

CREATE TABLE IF NOT EXISTS proof_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mode VARCHAR(40) NOT NULL DEFAULT 'sandbox_simulation',
  total_events INTEGER NOT NULL,
  total_at_risk BIGINT NOT NULL DEFAULT 0,
  recovered_amount BIGINT NOT NULL DEFAULT 0,
  recovered_count INTEGER NOT NULL DEFAULT 0,
  scenario_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_order_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS proof_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES proof_batches(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  scenario VARCHAR(80) NOT NULL,
  amount_in_subunits BIGINT NOT NULL,
  provider_order_id VARCHAR(100),
  recoverable BOOLEAN NOT NULL DEFAULT FALSE,
  recovered BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proof_events_batch ON proof_events(batch_id,sequence);

INSERT INTO recovery_policies(workspace_id)
SELECT id FROM workspaces
ON CONFLICT(workspace_id) DO NOTHING;

CREATE OR REPLACE FUNCTION recoverai_policy_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_recovery_policy_updated ON recovery_policies;
CREATE TRIGGER trg_recovery_policy_updated BEFORE UPDATE ON recovery_policies FOR EACH ROW EXECUTE FUNCTION recoverai_policy_updated();

CREATE OR REPLACE FUNCTION recoverai_payment_link_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at=NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_payment_link_updated ON payment_links;
CREATE TRIGGER trg_payment_link_updated BEFORE UPDATE ON payment_links FOR EACH ROW EXECUTE FUNCTION recoverai_payment_link_updated();
