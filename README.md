# BizManager

Business-management software for small and medium retail shops in Ethiopia
(clothing, footwear, grocery, electronics, cosmetics, general merchandise).
Owners can see their stock, what they sold, where the money is (Cash, Telebirr,
bank), what they spent and what actually makes a profit — and keep recording
when the network drops.

> **Status: pre-launch.** See [What is and is not built](#what-is-and-is-not-built)
> before promising anything to customers.

## Stack

Next.js 16.4 (App Router, Cache Components) · React 19.3 · TypeScript (strict) ·
Tailwind CSS 4 · PostgreSQL + Prisma 6.19 · Firebase Authentication (identity) +
Firebase Storage (private payment receipts) · Dexie / IndexedDB (offline) · Zod 4 ·
Vitest.

Money is always an **integer in the smallest currency unit** (ETB cents). No
floating point is used in financial calculations. Currency and country are
per-business settings; ETB is the default.

## What is and is not built

**Built and covered by tests where noted**

- Public website at `/` (English) and `/om` (Afaan Oromo), statically rendered, with
  live pricing streamed from the database. Sign-in / sign-up are localized.
- Plans **Basic / Pro / Business** with a single entitlement catalog
  (`src/shared/plans.ts`), monthly/yearly billing and an admin-editable discount.
- Manual subscription payments (Telebirr / bank transfer) with receipt upload,
  admin approve/reject (reason required), 3-day grace period, then read-only.
- Platform console at `/admin` (payments, businesses, plans, audit log).
- Products, categories, SKU, stock movements, adjustments, low-stock thresholds,
  **weighted-average costing**, multi-item POS, returns/refunds, expenses, accounts and
  transfers, sales / profit / expense / inventory reports.
- Team management (Pro): add staff/managers, **owner-controlled financial-report
  access** for managers, deactivation, audit trail.
- Product profitability and best-seller report with CSV export (Pro).
- Offline recording of **sales and expenses** with idempotent sync.

**Not built yet (the website marks these "Coming soon")**

- Multiple branches (Business plan): the data model supports branches, but there is
  no screen to create or switch them, and no consolidated report.
- Report comparisons with previous periods; exports other than the product report.
- Offline **inventory** changes (only sales and expenses sync offline today).
- Support-ticket workflow in the console.
- Barcode scanning and tax calculation are deliberately out of scope.

**Known simplifications**

- Reports are *management* reports, not certified accounting statements. No tax,
  depreciation or non-operating items.
- Sale returns restock at the original sale's cost and do not re-average cost.
- Team members must already have an account; no invitation emails are sent.
- Existing managers lose financial-report access until the owner grants it
  (migration `20261018210000`).
- The Afaan Oromo copy needs review by a native speaker; the Privacy and Terms pages
  are drafts that need legal review.

## Architecture

```
app/                    Routes (App Router)
  page.tsx, om/         Public site (en / om)
  (auth)/               Sign-in, sign-up
  app/[businessId]/     Authenticated product
  admin/                Platform console (separate from business roles)
  api/                  Route handlers (sync, receipts, exports)
src/shared/             Pure, tested business rules (no I/O): money, costing, profit,
                        plans, subscription access, team rules, i18n, validation
src/server/             Server-only: services, auth, storage, Prisma
src/client/             Dexie offline store, sync queue, Firebase client
src/components/         UI primitives and feature components
prisma/                 Schema, migrations, seed
tests/                  Vitest
```

Principles: PostgreSQL is authoritative; the server re-verifies identity,
membership, permissions and subscription state on **every** request (UI hiding is
never relied on); pure rules live in `src/shared` so they are unit-tested without a
database.

### Roles and access

| | Owner | Manager | Staff |
|---|---|---|---|
| Sell, view stock | ✓ | ✓ | ✓ |
| Record expenses | ✓ | ✓ | – |
| Financial reports, balances | ✓ | only if granted by owner | – |
| Team, plan & billing | ✓ | – | – |

**Platform administrators** (`platform_admins`) are a separate grant with roles
`SUPER_ADMIN`, `FINANCE`, `SUPPORT`. They see subscription and payment data only —
not any business's sales or financial reports. Receipt views and every payment,
pricing and status decision are written to an append-only audit log.

### Subscription lifecycle

`ACTIVE` → (period ends) → `GRACE` (3 days, everything works, notice shown) →
`READ_ONLY` (view and export only). A business with no approved payment is
read-only. Nothing is deleted. State is derived on the server from stored dates and
the server clock (`src/shared/subscription-access.ts`).

### Offline

Sales and expenses are written to IndexedDB with a stable client operation id and
sent to `POST /api/{businessId}/sync/batch`. The server applies each operation once
(idempotent), revalidates membership, permissions and subscription, and returns a
per-operation result. Operations that cannot be applied are kept and shown, never
discarded. Offline use needs the product list to have been loaded online first;
sign-in, reports and payments need a connection.

## Setup

Requirements: Node 20+, PostgreSQL 14+, a Firebase project.

```bash
npm ci
cp .env.example .env.local      # then fill in the values (see below)
npx prisma migrate deploy       # or `migrate dev` locally
npx prisma db seed              # creates the three plans with default prices
npm run dev
```

### Environment variables

See `.env.example` for the full annotated list. Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | ≥ 32 random characters; signs the session cookie |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin (server only) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config |
| `NEXT_PUBLIC_APP_URL` | Public site URL |
| `FIREBASE_STORAGE_BUCKET` | Private bucket for payment receipts |
| `BILLING_*` | Where customers send subscription payments (shown in-app) |

Optional: `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_PHONE` (footer/legal pages).
Never commit real secrets; Firebase Admin credentials must never reach the client.

### First platform administrator

Sign up normally, then:

```bash
npx tsx scripts/grant-platform-admin.ts grant you@example.com SUPER_ADMIN
```

The console is at `/admin`.

### Pricing

Default ETB prices (Basic 500, Pro 1,200, Business 2,500 per month; 20 % yearly
discount) are seeded as **launch defaults, not a market-tested decision**. Change
them at `/admin/plans` (super administrator). Features per plan are defined in code
(`src/shared/plans.ts`) and change only with a release.

## Commands

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit and service tests; no external services needed) |
| `npm run test:e2e` | Placeholder: Playwright is installed but **no config or end-to-end tests exist yet** |

Tests never need real accounts, payments or production credentials. Service-level
tests run against in-memory fakes; nothing here has been run against a real
PostgreSQL, Firebase or browser yet — do that before launch.

## Deployment and operations

See [DEPLOYMENT.md](./DEPLOYMENT.md). Outstanding operational items that this
repository cannot do for you: database backups and restore drills, Firebase Storage
rules deployment (`storage.rules`), hosting/region choice, monitoring, and legal
review of the Privacy and Terms pages.

Further reading: [ARCHITECTURE.md](./ARCHITECTURE.md),
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), [AGENTS.md](./AGENTS.md).
