# RecoverAI — What Broke During Development

The most useful development story is the one the code actually experienced.

## 1. Order persistence/schema mismatch

The demo initially reached the backend, but order creation failed because the application attempted to insert an `amount` column that was not present in the deployed `orders` table. The database migration and the active application model had drifted.

**Fix:** use `amount_in_subunits` as the canonical persisted amount, verify the live schema, and make migrations additive/idempotent.

## 2. Successful payment, missing local payment row

Razorpay Checkout could complete and signature verification could succeed, but the local `payments` table remained empty. The verification path updated the order but did not persist the authoritative Razorpay payment entity.

**Fix:** after signature verification, fetch the provider payment, validate order/amount/currency, upsert the payment, then update the local order. This is now also enforced by webhook reconciliation.

## 3. Workspace context missing from public demo

The SaaS version correctly required a workspace ID, but the public demo has no authenticated JWT. That caused `workspaceId is required` during public order creation.

**Fix:** authenticated requests use `req.auth.workspaceId`; the public demo uses only the dedicated `DEMO_WORKSPACE_ID` workspace.

## 4. Webhook persistence and reconciliation

Webhook events are stored durably, deduplicated by Razorpay event ID, signature-checked, replay-window checked and processed by a worker. Payment webhooks persist provider payments and order.paid events reconcile the local order.

## 5. Real Fittronics incident story

For the internship submission, the project can additionally describe the real Fittronics VPS compromise and subsequent webhook migration because it is a genuine operational failure rather than a manufactured demo story. Use the exact facts, dates and remediation steps from your own incident record; do not invent details for the submission.
