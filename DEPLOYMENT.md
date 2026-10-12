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
npx prisma db seed          # Seeds plans (STARTER, BUSINESS, PRO)
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

Payment gateway integration is **not yet configured** (UD-003 pending).

The billing domain is fully implemented:
- Plans, subscriptions, trial periods, usage limits — all in the database
- `subscription.service.ts` provides entitlement checking
- The subscription settings page shows plan details and trial status

To activate billing:
1. Select a payment provider (Chapa for Ethiopia, or Stripe for international)
2. Add the provider's credentials to environment variables
3. Implement the webhook handler at `/api/billing/webhook`
4. Call `updateSubscriptionStatus()` from the webhook after payment verification

## Offline sync

Business data (sales, expenses) is stored in IndexedDB via Dexie.js and synced to PostgreSQL via:
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
