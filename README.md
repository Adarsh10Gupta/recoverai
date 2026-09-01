# RecoverAI v4 — Payment Reliability & Recovery Platform

RecoverAI is a multi-tenant payment reliability control plane for businesses using Razorpay. A merchant creates a private workspace and authorizes RecoverAI to monitor its Razorpay account. RecoverAI accepts signed provider webhooks, persists every event, maps events to the merchant's orders and payments, reconciles provider state against local state, detects incidents, estimates revenue at risk, scores recovery opportunities, recommends a next action, and records every recovery step in an audit trail. The v4 release adds a transparent Recovery Intelligence engine and controlled automation: high-confidence, non-customer-charging reconciliation can run automatically when a workspace owner enables the rule. Customer data is workspace-scoped server-side so one merchant cannot read another merchant's incidents, payments, orders or audit history.

## v4 includes

### SaaS / privacy
- Signup and login with bcrypt password hashing and JWT sessions.
- Private workspace per customer.
- Workspace-scoped dashboard, incidents, payments, orders, recovery actions and audit logs.
- Server-side Razorpay OAuth tokens encrypted with AES-GCM.
- OAuth state hashing, expiration and one-time consumption.
- Provider webhooks mapped by Razorpay account ID.

### Payment reliability
- Signed Razorpay webhook intake.
- Replay-window validation.
- Idempotent webhook storage.
- Background webhook worker with retry/dead-letter states.
- Order/payment reconciliation.
- Incident creation for failed payments, state mismatches, amount/currency mismatches and unmatched provider objects.
- Traceable recovery actions.

### Recovery Intelligence
- Explainable recovery score (0–100).
- Revenue-at-risk estimate.
- Recommended action.
- Confidence level.
- Reason/explanation shown to the operator.
- Priority queue sorted by recovery score and value.

The current intelligence engine is deliberately deterministic and explainable. It is a production-safe baseline rather than a claim that an LLM is being used. A model provider can be added later behind the same service boundary.

### Controlled automation
- Workspace-level automation setting.
- Safe reconciliation rule.
- Minimum score threshold.
- Explicit owner opt-in.
- No payment retry/charge is triggered by the automation rule.
- Automated actions are persisted in `automation_runs` and the audit log.
- Duplicate runs are suppressed for a short safety window.

### Frontend
- New production-style fintech console.
- Structured navigation with labeled sections.
- Responsive mobile drawer.
- Large readable typography.
- Geist/Geist Mono design direction.
- Motion-based entrance and hover animations.
- Reduced-motion support.
- Dashboard, incidents, incident detail, payments, orders, intelligence, automation, audit and settings pages.

## Run locally

### Backend

```powershell
cd D:\RecoverAI-v4\backend
npm install
npm run migrate
npm run dev
```

The backend runs on `http://localhost:5000`.

### Frontend

```powershell
cd D:\RecoverAI-v4\merchant-demo
npm install
npm run dev
```

Vite normally starts at `http://localhost:5173`.

Copy `.env.example` to `.env` for the backend and configure your existing values.

For the frontend:

```text
VITE_API_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=your_test_key_id
```

Do not upload `.env` files, API secrets, OAuth client secrets or encryption keys.

## Database migration

Run:

```powershell
npm run migrate
```

The migration runner applies:
- `schema.sql`
- `migration.sql`
- `migration_saas.sql`
- `migration_saas_v2.sql`
- `migration_saas_v3.sql`

The v3 migration adds recovery intelligence fields and automation tables.

## Razorpay partner/OAuth setup

Once Razorpay approves/registers the Technology Partner application, configure:

```text
RAZORPAY_OAUTH_CLIENT_ID=
RAZORPAY_OAUTH_CLIENT_SECRET=
RAZORPAY_OAUTH_REDIRECT_URI=https://YOUR_PUBLIC_BACKEND/api/razorpay/oauth/callback
RAZORPAY_OAUTH_MODE=test
PUBLIC_WEBHOOK_URL=https://YOUR_PUBLIC_BACKEND/api/webhooks/razorpay
```

The merchant then uses **Settings → Connect Razorpay**. The browser is redirected to Razorpay for authorization; the access/refresh tokens are returned to the backend and encrypted at rest. The browser never receives the provider access token.

## Important production note

The current public `/api/orders` endpoints exist for the sandbox/demo checkout flow and legacy integration. Before exposing customer-facing order creation publicly, put that flow behind the appropriate authenticated merchant/session boundary or separate it into a dedicated demo route. The SaaS dashboard APIs are already protected with JWT + workspace scoping.

## Product flow

Detect → Decide → Recover → Verify

1. Detect a provider event.
2. Verify signature and persist it idempotently.
3. Match it to the correct workspace/order/payment.
4. Reconcile provider state with local state.
5. Create an incident when states disagree.
6. Score the incident and estimate revenue at risk.
7. Recommend the safest recovery action.
8. Let the operator recover manually or enable safe automation.
9. Verify the resulting provider/local state.
10. Persist the recovery action and audit trail.
