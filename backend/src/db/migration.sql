-- Safe migration for an existing RecoverAI PostgreSQL database.
-- Run this BEFORE deploying the new backend if you already have production tables/data.

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS signature VARCHAR(255);

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'received';

ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_merchant_order_id
  ON orders(merchant_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_razorpay_order_id
  ON orders(razorpay_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_razorpay_payment_id
  ON payments(razorpay_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_razorpay_event_id
  ON webhook_events(razorpay_event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events(status);

CREATE INDEX IF NOT EXISTS idx_incidents_status
  ON incidents(status);

CREATE INDEX IF NOT EXISTS idx_recovery_actions_incident
  ON recovery_actions(incident_id);
