# BizManager — Deployment Guide

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Firebase project (Authentication enabled)
- Domain with HTTPS (required for PWA installation and secure cookies)

## First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env.local
# Fill in all required values in .env.local

# 3. Create and seed the database
# Start PostgreSQL, then:
npx prisma migrate deploy   # Applies all committed migrations
npx prisma db seed          # Creates the plans (BASIC, PRO, BUSINESS) if missing
npx prisma generate         # Regenerate Prisma client

# 4. Verify Firebase
# Enable Email/Password and Google sign-in in Firebase Console
# Add your domain to Firebase Auth authorized domains
```

## Development

```bash
npm run dev          # Start dev server (Next.js 16, Turbopack)
npm run type-check   # TypeScript check
npm run lint         # ESLint
npm run test         # Vitest unit tests
```

## Production build

```bash
npm run build
npm run start
```

## Database migrations

**Apply all pending migrations to an existing database:**
```bash
npx prisma migrate deploy
```

**Check migration status:**
```bash
npx prisma migrate status
```

**After schema changes (development only):**
```bash
npx prisma migrate dev --name describe_change
```

## Migration history

| Migration | Description |
|---|---|
| `20261009140937_initial_schema` | Full domain schema (Phases 1-4) |
| `20261011090158_phase5_receipt_phase8_return_fields` | receiptNumber, ReturnStatus, StockDisposition |
| `20261012000000_phase11_saas_billing` | SaaS billing models (Plan, Subscription, Invoice) |

## Environment variables

See `.env.example` for all required variables with documentation.

**Critical server-side secrets (never NEXT_PUBLIC_):**
- `DATABASE_URL`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Future: payment provider secret keys

## SaaS billing

Subscriptions are collected **manually** (Telebirr / bank transfer). There is no payment
gateway and no webhook: an owner uploads a receipt, a platform administrator verifies the
transfer and approves or rejects it (see "Manual subscription billing and platform console"
below). Decision UD-003 is therefore resolved as *manual transfer + admin confirmation*.

- Plans, subscriptions and payments live in the database; prices and the yearly discount
  are editable by a super administrator at `/admin/plans`.
- Feature entitlements and limits are defined in code (`src/shared/plans.ts`).
- `subscription.service.ts` derives access from stored dates and the server clock:
  3-day grace after expiry, then read-only. There is no automatic trial.

## Offline sync

Business data (sales, expenses, stock changes) is stored in IndexedDB via Dexie.js and synced to PostgreSQL via:
- `POST /api/[businessId]/sync/batch` — batch sync endpoint
- `SyncOperation` table — server-side idempotency record

## PWA icons

Create proper PNG icons and place them in `public/icons/`:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)  
- `icon-maskable-192.png` (192×192, with safe zone for maskable)

The current `icon.svg` can be used to generate PNG icons via:
```bash
npx sharp-cli -i public/icons/icon.svg -o public/icons/icon-192.png resize 192 192
npx sharp-cli -i public/icons/icon.svg -o public/icons/icon-512.png resize 512 512
```

## Security checklist

- [ ] All environment variables configured in hosting platform
- [ ] Firebase authorized domains updated for production URL
- [ ] Database connection uses SSL (`?sslmode=require`)
- [ ] HTTPS enforced at load balancer level
- [ ] Cookie `secure: true` is set (automatic in production)
- [ ] `FIREBASE_PRIVATE_KEY` stored as a secret, not a plain env var
- [ ] Payment webhook secrets validated before processing (when integrated)

---

## Manual subscription billing and platform console

BizManager collects subscription payments **manually** (Telebirr / bank transfer).
There is no payment gateway and no automatic verification.

1. **Apply the migration** `20261018200000_manual_subscription_payments`
   (`npx prisma migrate deploy`), then run `npx prisma db seed` to create the
   BASIC / PRO / BUSINESS plan rows. The migration renames the previous
   STARTER / BUSINESS / PRO plans in place (old BUSINESS → PRO, old PRO →
   BUSINESS, STARTER → BASIC) so existing subscriptions keep their plan link.
   It also adds two partial unique indexes that Prisma cannot model (one pending
   payment per business; one live use per transfer reference). Run
   `prisma migrate dev` against a scratch database before production to confirm
   it applies cleanly.
2. **Receipt storage.** Set `FIREBASE_STORAGE_BUCKET` and deploy `storage.rules`
   (`firebase deploy --only storage`) so clients cannot read objects directly.
   Receipts are served only through `/api/payments/[id]/evidence`.
3. **Payment instructions.** Set the `BILLING_*` variables so owners see where to send money.
4. **First administrator.** Sign up normally, then run
   `npx tsx scripts/grant-platform-admin.ts grant you@example.com SUPER_ADMIN`.
   The console is at `/admin`. Platform admins have no access to any business's
   sales, expenses or reports.
5. **Pricing.** Default ETB prices and a 20 % yearly discount are seeded. Change
   them at `/admin/plans` (super administrator). They are defaults chosen to
   launch with, not a market-tested decision — review them before going live.

## Later additions

- **Migrations** (apply in order with `npx prisma migrate deploy`):
  `20261018200000_manual_subscription_payments`, `20261018210000_report_access_grants`,
  `20261022000000_support_tickets`. None drops data. Test them on a scratch database first —
  they have been syntax-checked but not applied to a real database.
- **Security headers** are set in `next.config.ts`: `nosniff`, frame denial, referrer and
  permissions policies, HSTS, and a partial CSP (`frame-ancestors`, `base-uri`, `object-src`,
  `form-action`). **Remaining hardening:** a `script-src` CSP needs per-request nonces.
- **Rate limiting** on `POST /api/auth/session` is in-memory and per server instance. On
  serverless or multi-instance hosting, add an edge/WAF rate limit as well. Payment and
  support submissions are limited per business in the database (shared across instances).
- **Support** is handled at `/admin/support` by `SUPPORT` (or `SUPER_ADMIN`) administrators.
  They see ticket text only. No mechanism exists for platform staff to open a business's
  sales, expenses or reports, so there is no such access to log; if one is ever added it
  must be owner-granted, time-limited and written to the platform audit log.
- **Branches** need no extra deployment steps (branch access rows already existed).
