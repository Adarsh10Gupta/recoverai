# RecoverAI v3.2 Dashboard UI Refresh

This package contains the RecoverAI merchant dashboard UI refresh based on the uploaded v3.1 merchant-demo frontend.

## What changed
- Replaced the large fixed sidebar with a floating navigation rail.
- Added a responsive bottom navigation dock for small screens.
- Reworked the dashboard into a payment-operations console with a health strip, KPI cards, incident queue, system status and recovery pipeline.
- Added Plus Jakarta Sans for interface typography and DM Mono for operational/data values.
- Reduced the purple/gradient-heavy visual language and moved the dashboard toward a restrained fintech palette.
- Added purposeful hover, reveal, and workflow animations.
- Added `prefers-reduced-motion` support.
- Kept existing API calls, authentication, workspace scoping, incidents, recovery, Razorpay connection flow, payments, orders and audit-log behavior intact.

## Important
The uploaded archive contained the `merchant-demo` frontend only. This refresh therefore changes the frontend files only; it does not include or modify the backend/database project.

Do not copy `.env.local` into a public repository. Use `.env.example` as the template for local configuration.
