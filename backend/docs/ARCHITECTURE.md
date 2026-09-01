# RecoverAI — Architecture & Recovery Control Plane

## One-page flow

```text
Razorpay OAuth / Test API credentials
                |
                v
      +-----------------------+
      | Webhook ingestion     |
      | raw-body HMAC         |
      | replay window         |
      | idempotency           |
      +-----------+-----------+
                  |
                  v
      +-----------------------+
      | Durable webhook queue |
      +-----------+-----------+
                  |
                  v
      +-----------------------+
      | Reconciliation        |
      | provider vs local     |
      | order/payment state   |
      +-----------+-----------+
                  |
                  v
      +-----------------------+
      | Recovery intelligence |
      | score / probability   |
      | confidence / risk     |
      +-----------+-----------+
                  |
                  v
      +-----------------------+
      | Policy engine         |
      | retry limit           |
      | cooldown              |
      | human approval        |
      | chargeback stop       |
      +-----------+-----------+
                  |
          +-------+--------+
          |                |
          v                v
   Safe reconcile     Payment Link
                      recovery
          |                |
          +-------+--------+
                  |
                  v
      +-----------------------+
      | Verification          |
      | webhook / poll        |
      | outcome confirmation  |
      +-----------+-----------+
                  |
                  v
      Incident resolved + audit timeline
```

## Data boundaries

Every operational object is scoped to `workspace_id`. Public demo orders use `DEMO_WORKSPACE_ID`; authenticated merchant requests use the JWT workspace claim. Provider credentials remain server-side.

## Recovery types

- Provider payment failure → intelligence + controlled recovery path.
- Local/provider state mismatch → reconciliation; this path never charges a customer.
- Checkout abandonment → create a fresh, short-lived Razorpay Payment Link and log the WhatsApp/SMS dispatch as `queued` in the demo.
- Recurring/mandate failure → policy evaluation and compliant escalation; no silent retry.
- Amount/currency mismatch → manual investigation; never auto-resolve.

## Evidence model

RecoverAI exposes two numbers separately:

1. **Provider-verified recovery** — derived from real provider-backed incidents whose recovery action completed and whose outcome was verified.
2. **Sandbox proof run** — a 50-event synthetic resilience batch. It may create Razorpay Test Mode orders, but its recovered amount is explicitly marked simulated because Razorpay Test Mode does not move real money.

This prevents a demo simulation from being presented as real monetary recovery.
