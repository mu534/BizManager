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
npx prisma db seed          # Creates the plans (BASIC, PRO, BUSINESS) if missing; idempotent
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

## Service worker / PWA

- `public/sw.js` is served as a static file and registered on the client.
- **HTTPS is required in production** for service worker registration. Browsers
  refuse to register a service worker on insecure origins (localhost is the
  only exception). Ensure HTTPS is enforced at the load balancer/edge.
- The service worker enables offline data entry (IndexedDB) and background sync.
  See the "Offline sync" section above.

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


## Release checklist (security and SEO)

- Set `NEXT_PUBLIC_APP_URL` to the real https origin. `sitemap.xml`, `robots.txt`,
  the share image and canonical links are all built from it.
- HSTS and a **report-only** Content-Security-Policy are sent in production. On staging,
  open the app and the sign-in page with DevTools open and check the console for
  "Content Security Policy" violations (Google sign-in, uploads, offline sync). When there
  are none, rename the `Content-Security-Policy-Report-Only` header in `next.config.ts`
  to `Content-Security-Policy` to enforce it.
- In the Firebase console (Authentication): confirm the production domain is under
  *Authorized domains*, and review the password-reset and verification email templates.
- Continuous integration (`.github/workflows/ci.yml`) runs type-check, tests and a build on
  every pull request, and applies all migrations to an empty PostgreSQL database.

## Push notifications (low-stock alerts)

Optional. Without these three settings the feature is simply off and nothing else changes.

1. Generate a key pair once: `npx web-push generate-vapid-keys`
2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public key), `VAPID_PRIVATE_KEY` (private key, server only) and
   `VAPID_CONTACT_EMAIL` (an address you read; browsers may use it to contact you about abuse).
   Keep the same key pair forever: changing it silently stops every existing device from receiving alerts.
3. Run `npx prisma migrate deploy` (adds the `push_subscriptions` table), then redeploy.
4. Each owner or manager opens **Notifications** in the app and taps *Turn on low-stock alerts* on each device.
   iPhones only support this after BizManager is added to the Home Screen.

An alert is sent once when a product drops to its "minimum stock" level (and again only after it has been
restocked above that level and drops again). Owners are told about every branch, managers about the branches
they can access. Alerts are sent after the sale is saved, so a notification problem can never fail a sale.

## Before new owners can sign up (required)

Under the "no automatic trial" rule a new owner must pay before recording anything, so they need to be
told where to send money. Set at least one of these in the server environment:

- Telebirr: `BILLING_TELEBIRR_NUMBER` (and `BILLING_TELEBIRR_NAME`)
- Bank: `BILLING_BANK_NAME` and `BILLING_BANK_ACCOUNT` (and `BILLING_BANK_ACCOUNT_NAME`)

If none is set, owners see "Payment details have not been configured" and platform admins see a red
warning on the console overview. Use real, business-owned accounts: owners will send money to them.

## Payment alerts for admins

New owners are waiting for approval, so admins are told straight away:

- The console navigation shows a number badge on **Payments** whenever payments are waiting.
- Optional Telegram message for each new payment: set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID`
  (steps in `.env.example`). The message names the shop, plan, amount and reference. It never includes the
  receipt image or the owner's contact details. If Telegram is down, the owner's submission still succeeds.

## Backups

Two layers. Use both.

1. **Your database host's own backups.** Turn on automated daily backups and, if offered, point-in-time recovery
   (Neon, Supabase, AWS RDS and others have it). Check the retention period matches how far back you may need.
2. **Your own encrypted offsite copy** (this repository), in case the host account itself is lost:
   - `scripts/backup-db.sh` dumps the database, encrypts it (AES-256), reads it back to prove it is valid, optionally
     uploads it, and keeps the newest few local copies. Needs `pg_dump` and `gpg`.
   - `.github/workflows/backup.yml` runs it every night. To switch it on, add repository **secrets**
     `BACKUP_DATABASE_URL` (direct, not pooled), `BACKUP_PASSPHRASE`, `BACKUP_BUCKET`, `BACKUP_BUCKET_ENDPOINT`,
     `BACKUP_BUCKET_KEY_ID`, `BACKUP_BUCKET_SECRET`, then the **variable** `BACKUPS_ENABLED=true`
     (and `POSTGRES_MAJOR` if your server is not version 16). Use a private bucket in your own account
     (Cloudflare R2, Backblaze B2 and AWS S3 all work), with lifecycle rules for how long to keep files.
   - Store `BACKUP_PASSPHRASE` in a password manager too. If it is lost, every backup is unreadable.
   - Backups hold every shop's financial records. Keep the bucket private and the passphrase secret.

**A backup you have never restored is a hope, not a backup.** Once a month, restore the newest one into an empty
scratch database and compare the counts with production:

```
RESTORE_DATABASE_URL=postgresql://…/scratch BACKUP_PASSPHRASE=… RESTORE_CONFIRM=yes ./scripts/restore-check.sh
```

The script refuses to run against the production URL, and prints row counts for users, businesses, sales and payments.

## Error monitoring

Sentry (optional). Create a project at sentry.io (platform: Next.js) and set `SENTRY_DSN` and
`NEXT_PUBLIC_SENTRY_DSN` to its DSN. Without them nothing is sent.

What is and is not sent: errors and their stack traces only. Cookies, headers, request bodies, query strings, user
details and breadcrumbs are removed before sending (`src/shared/monitoring.ts`), and expected user errors
(validation, permissions, not found) are ignored. There is no performance tracing or session replay.
Sentry stores data outside Ethiopia; mention error monitoring in your privacy policy.

## Enforcing the Content-Security-Policy

The policy is sent in report-only mode. Browsers post anything they would block to `/api/csp-report`,
which writes lines starting `[csp]` to your server logs (browser-extension noise is filtered out).

1. Deploy to staging and use the app: sign in with email and with Google, sell, print a receipt, install the app,
   go offline and back online, turn on notifications, open the admin console.
2. Search the staging logs for `[csp]`. Fix or allow anything legitimate (edit the `CSP` list in `next.config.ts`).
3. When a full pass leaves no `[csp]` lines, set `CSP_ENFORCE=true` and **rebuild** (the value is read at build time).
4. Watch the logs for a day after release. To roll back, unset `CSP_ENFORCE` and rebuild.