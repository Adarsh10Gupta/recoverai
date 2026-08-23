CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    merchant_order_id VARCHAR(100) NOT NULL UNIQUE,
    razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,

    amount_in_subunits BIGINT NOT NULL CHECK (amount_in_subunits > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',

    receipt VARCHAR(100),

    status VARCHAR(30) NOT NULL DEFAULT 'created',

    verified_at TIMESTAMPTZ,
    captured_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
ON orders(created_at DESC);


-- =========================================================
-- PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

    razorpay_payment_id VARCHAR(100) NOT NULL UNIQUE,
    razorpay_order_id VARCHAR(100),

    amount_in_subunits BIGINT NOT NULL,
    currency VARCHAR(10) NOT NULL,

    status VARCHAR(30) NOT NULL,

    method VARCHAR(50),

    email VARCHAR(255),
    contact VARCHAR(100),

    error_code VARCHAR(100),
    error_description TEXT,

    captured_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id
ON payments(order_id);

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id
ON payments(razorpay_order_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
ON payments(status);


-- =========================================================
-- WEBHOOK EVENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    razorpay_event_id VARCHAR(150) NOT NULL UNIQUE,

    event_type VARCHAR(100) NOT NULL,

    payload JSONB NOT NULL,

    signature VARCHAR(255),

    status VARCHAR(30) NOT NULL DEFAULT 'received',

    error_message TEXT,

    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type
ON webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
ON webhook_events(received_at DESC);


-- =========================================================
-- INCIDENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

    type VARCHAR(100) NOT NULL,

    severity VARCHAR(30) NOT NULL DEFAULT 'medium',

    status VARCHAR(30) NOT NULL DEFAULT 'open',

    description TEXT NOT NULL,

    expected_state JSONB,
    actual_state JSONB,

    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_status
ON incidents(status);

CREATE INDEX IF NOT EXISTS idx_incidents_type
ON incidents(type);

CREATE INDEX IF NOT EXISTS idx_incidents_detected_at
ON incidents(detected_at DESC);


-- =========================================================
-- RECOVERY ACTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS recovery_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,

    action_type VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    attempt INTEGER NOT NULL DEFAULT 1,

    result JSONB,

    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recovery_actions_incident
ON recovery_actions(incident_id);


-- =========================================================
-- AUDIT LOG
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(150),

    action VARCHAR(100) NOT NULL,

    actor VARCHAR(100) NOT NULL DEFAULT 'system',

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs(created_at DESC);

