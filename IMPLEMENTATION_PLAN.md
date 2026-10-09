# Implementation Plan
## Business Management SaaS Platform

**Version:** 0.1 — Pre-implementation  
**Depends on:** ARCHITECTURE.md  
**Status:** Awaiting approval before Phase 1 begins  
**Last updated:** 2026-10-08

---

## How to read this document

Tasks are grouped by phase. Within each phase, tasks are listed in dependency order — a task should not begin until the tasks it depends on are complete. Each task is tagged with:

- **Type:** `infra` | `db` | `server` | `client` | `ui` | `test`
- **Risk:** `low` | `medium` | `high`
- **Blocks:** tasks that cannot start until this one is complete

**Before starting any phase**, confirm that the unresolved decisions in ARCHITECTURE.md §21 that affect that phase have been answered.

---

## Unresolved Decisions Gate

The following architectural decisions from ARCHITECTURE.md §21 **must be answered before the indicated phase begins**. Do not assume a default and proceed silently.

| Decision | Status | Required before |
|---|---|---|
| UD-001 | ⏳ Awaiting decision | Phase 9 (Sync) |
| UD-002 | ✅ Resolved 2026-10-08 | Phase 3 (Auth) |
| UD-003 | ⏳ Awaiting decision | Phase 11 (Billing) |
| UD-004 | ✅ Resolved 2026-10-08 | Phase 2 (Schema) |
| UD-005 | ✅ Resolved 2026-10-08 | Phase 2 (Schema) |
| UD-006 | ✅ Resolved 2026-10-08 | Phase 2 (Schema) |
| UD-007 | ⏳ Awaiting decision | Phase 4 (Products) |

### Resolved decisions

**UD-002 — Firebase auth methods:** Email/password and Google OAuth in MVP. Phone OTP explicitly deferred. Auth module must be structured for extensibility (new provider strategies without rewriting the identity layer).

**UD-004 — Financial account scope:** Accounts are per-business (business-wide, shared across branches) in the MVP. Schema includes a nullable `branchId` on `FinancialAccount` (default null = business-wide) so branch-specific accounts can be introduced later without a breaking migration.

**UD-005 — Money storage:** All monetary amounts stored as **integers in the smallest currency unit** (e.g., 10050 = 100.50 ETB). No floating-point arithmetic for money anywhere. All conversions and formatting go through `src/shared/money.ts` — no exceptions.

**UD-006 — Tax in MVP:** Include nullable `taxRate` (Decimal?) and `taxAmount` (Int?) columns on `SaleItem` and `Expense`. Both default to null. No tax calculation logic, no Ethiopian tax rules, no tax reports in MVP. Tax logic is a future phase.

### Dependency version decisions (Correction 4 — reviewed 2026-10-08)

All versions were verified against npm for latest stable releases. The criteria for each choice: stable (not RC/pre-release), compatible with Next.js 16.4.0 + React 19.3.0 + TypeScript 5, no known breaking issues with the other selected packages.

| Package | Version | Rationale |
|---|---|---|
| `prisma` + `@prisma/client` | **6.19.3** | Prisma v7 has documented incompatibilities with Next.js 16 + Turbopack that require multi-step workarounds. Prisma v8 is in RC (pre-release). v6.19.3 is the latest stable v6 release. v6 receives security patches until November 2026. **Do not upgrade to v7 or v8 without a dedicated migration step.** |
| `firebase` | **11.10.0** | v11 is the current stable major. v12 exists and is more recent, but v11 is still actively maintained and has no breaking changes that affect our auth + FCM usage. Staying on v11 avoids introducing an untested migration mid-project. Review before Phase 10 (push notifications). |
| `firebase-admin` | **14.5.0** | v14.5.0 is the current latest stable. v13 is old; v14 is the correct choice. No incompatibilities with Node.js 20/22 or our server-side token verification usage pattern. |
| `dexie` | **4.4.6** | Latest stable. v4 is the current major. No known issues with the IndexedDB sync architecture. |
| `zod` | **4.6.5** | Latest stable. Zod v4 is the current major — note the API differs from v3 in some areas (error shapes, `.safeParse` internals). All schemas in this project must target the v4 API. Do not copy v3 examples without verifying compatibility. |
| `vitest` + `@vitest/coverage-v8` | **3.2.4** | Vitest v5 exists (latest) but is a recent major release. v3.x is stable, well-documented, and has no known issues with TypeScript 5 or our project setup. Both packages must always be the same version. Review before upgrading. |
| `@playwright/test` | **1.52.0** | v1.64.0 is the current latest. v1.52.0 is stable and functional. The version gap is minor versions within the same major — no breaking changes. Either works; using 1.52.0 as originally declared to avoid introducing an untested change before Phase 12. |
| `tsx` | **4.19.4** | v4.23.15 is the latest within v4. The gap is minor. 4.19.4 is stable. Used only for `prisma/seed.ts` execution — no runtime impact. |
| `next` | **16.4.0** | Already installed. Do not change. |
| `react` + `react-dom` | **19.3.0** | Already installed. Do not change. |

**Packages that must stay in sync (same version):**
- `prisma` and `@prisma/client` must always be identical versions
- `vitest` and `@vitest/coverage-v8` must always be identical versions

### Open decisions still pending

**UD-001** — What happens when a synced sale causes negative stock? Required before Phase 9.

**UD-003** — Which payment gateway for subscription billing? Required before Phase 11.

**UD-007** — Primary barcode scanning hardware (camera-based vs. USB wedge)? Required before Phase 4.

---

## Phase 0 — Repository Audit and Architecture ✓

**Status: Complete**

| # | Task | Type | Notes |
|---|---|---|---|
| 0.1 | Inspect existing repository | infra | ✓ Done |
| 0.2 | Identify Next.js version and installed dependencies | infra | ✓ Done — Next.js 16.4.0, React 19.3.0 |
| 0.3 | Inspect existing folder structure | infra | ✓ Done — clean scaffold, no business code |
| 0.4 | Identify what is configured vs. missing | infra | ✓ Done |
| 0.5 | Create ARCHITECTURE.md | infra | ✓ Done |
| 0.6 | Create IMPLEMENTATION_PLAN.md | infra | ✓ This document |

### What was found
- Next.js 16.4.0 (App Router, `cacheComponents: true`, `partialPrefetching: true`, `experimental.agentFeedback: true`)
- React 19.3.0
- TypeScript 5 with `strict: true` already enabled
- Tailwind CSS 4 via `@tailwindcss/turbopack`
- ESLint 9 with `eslint-config-next` (TypeScript + Core Web Vitals)
- Clean `create-next-app` scaffold — one commit, no business logic
- `app/layout.tsx` uses the new Next.js 16 `LayoutProps<"/">` typed props
- No Prisma, no Firebase, no Dexie.js, no Zod installed yet
- No PostgreSQL connection configured
- No environment variables configured
- No tests configured
- No PWA manifest

### What was NOT changed in Phase 0
Nothing was changed. Phase 0 is audit-and-plan only.

---

## Phase 1 — Foundation

**Goal:** A working, correctly structured project with all core infrastructure packages installed, environment configuration in place, and the error handling foundation established. No business features yet.

**Prerequisites:** UD-005 (money storage format) confirmed before adding Zod schemas.

---

### 1.1 — Update `next.config.ts`

**Type:** infra | **Risk:** low

Remove `experimental.useOffline` — our offline architecture is Dexie-first and does not depend on this experimental feature. Retain `cacheComponents`, `partialPrefetching`, and `agentFeedback`.

**Status: Complete.** `experimental.useOffline` was added in the initial Phase 1 pass and has now been removed.

---

### 1.2 — Create `src/` directory structure

**Type:** infra | **Risk:** low | **Blocks:** everything in Phase 1+

Create the following empty directories with `.gitkeep` files so the structure is committed:

```
src/
  server/
    auth/
    db/
    services/
  shared/
    types/
    validation/
    errors/
  client/
    db/
    hooks/
    firebase/
  components/
    ui/
    layout/
    offline/
    forms/
```

---

### 1.3 — Install core dependencies

**Type:** infra | **Risk:** medium | **Blocks:** 1.4, 1.5, 1.6, 2.x, 3.x

Install with exact versions. Do not use `latest` or open ranges.

**Production dependencies:**
```
prisma           @prisma/client
firebase         firebase-admin
dexie
zod
```

**Dev dependencies:**
```
vitest           @vitest/coverage-v8
@testing-library/react
playwright       @playwright/test
```

**Notes:**
- Verify `firebase` and `firebase-admin` version compatibility with Next.js 16 / React 19 before installing.
- `firebase-admin` must only ever be imported in `src/server/` files. Never in client code.
- Do NOT install `next-auth`, `supabase`, or any other auth wrapper.
- Do NOT install a UI component library (shadcn, MUI, etc.) at this stage — build a minimal design system from scratch per the UI principles in ARCHITECTURE.md.

**Verify:** `npm run build` still passes. `npm run lint` passes.

---

### 1.4 — Environment configuration

**Type:** infra | **Risk:** low | **Blocks:** 3.x

Create `.env.example` with all required variables documented (no real values). Create `.env.local` locally (never committed — already in `.gitignore`).

```bash
# .env.example

# ─── Database ───────────────────────────────────────────────
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public"

# ─── Firebase Admin (server-side only) ──────────────────────
FIREBASE_PROJECT_ID=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY=""          # Include \n characters verbatim

# ─── Firebase Client (public — safe to expose) ──────────────
NEXT_PUBLIC_FIREBASE_API_KEY=""
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=""
NEXT_PUBLIC_FIREBASE_PROJECT_ID=""
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=""
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=""
NEXT_PUBLIC_FIREBASE_APP_ID=""

# ─── App ────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ─── Push notifications (VAPID) ─────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
```

---

### 1.5 — Error handling foundation

**Type:** server | **Risk:** low | **Blocks:** 3.x, 4.x, 5.x

Create `src/shared/errors/app-error.ts`.

Define:
- `AppErrorCode` enum (all error codes the system can produce)
- `AppError` class (extends `Error`, carries `code`, `message`, `statusCode`, optional `details`)
- `isAppError` type guard

```typescript
// Error codes (non-exhaustive initial set)
enum AppErrorCode {
  OFFLINE             = 'OFFLINE',
  VALIDATION_ERROR    = 'VALIDATION_ERROR',
  UNAUTHORIZED        = 'UNAUTHORIZED',       // not authenticated
  FORBIDDEN           = 'FORBIDDEN',           // authenticated, not allowed
  NOT_FOUND           = 'NOT_FOUND',
  CONFLICT            = 'CONFLICT',            // duplicate / sync conflict
  TENANT_VIOLATION    = 'TENANT_VIOLATION',    // cross-tenant access attempt
  INSUFFICIENT_STOCK  = 'INSUFFICIENT_STOCK',
  SUBSCRIPTION_LIMIT  = 'SUBSCRIPTION_LIMIT',
  SERVER_ERROR        = 'SERVER_ERROR',
  SYNC_ERROR          = 'SYNC_ERROR',
}
```

Create `src/shared/errors/index.ts` as the public export.

**Verify:** TypeScript compiles with no errors.

---

### 1.6 — TypeScript path aliases

**Type:** infra | **Risk:** low

Add path aliases to `tsconfig.json` for the new `src/` structure:

```json
"paths": {
  "@/*": ["./*"],
  "@server/*": ["./src/server/*"],
  "@shared/*": ["./src/shared/*"],
  "@client/*": ["./src/client/*"],
  "@components/*": ["./src/components/*"]
}
```

**Verify:** `npm run build` passes.

---

### 1.7 — ESLint import boundary rules

**Type:** infra | **Risk:** low

Add rules to `eslint.config.mjs` to prevent server code from being imported by client code:
- Warn when anything from `src/server/` is imported outside of server components or Route Handlers.
- Enforce no-`any` rule.

At minimum, enable `@typescript-eslint/no-explicit-any` as an error.

---

### 1.8 — PWA manifest stub

**Type:** infra | **Risk:** low

Create `app/manifest.ts` returning a minimal but valid `MetadataRoute.Manifest`. Use placeholder app name and icon paths. Actual icons and branding come later.

---

### 1.9 — Update root layout metadata

**Type:** client | **Risk:** low

Update `app/layout.tsx`:
- Change `metadata.title` from "Create Next App" to the app name.
- Add `OfflineBanner` placeholder component (renders nothing until Phase 9).
- Keep `LayoutProps<"/">` typing — this is correct Next.js 16 syntax.

---

### Phase 1 completion checklist
- [ ] `next.config.ts` has `useOffline: true`
- [ ] `src/` directory structure exists
- [ ] All packages installed, `npm run build` passes, `npm run lint` passes
- [ ] `.env.example` committed, `.env.local` created locally (not committed)
- [ ] `AppError` and `AppErrorCode` defined and exported
- [ ] TypeScript path aliases configured
- [ ] PWA manifest stub present
- [ ] No business logic exists yet

---

## Phase 2 — Database

**Goal:** A working PostgreSQL connection, a complete Prisma schema covering all core domain entities, an initial migration, and a development seed script.

**Prerequisites:**
- UD-004 ✅ Financial accounts are per-business; `FinancialAccount` has a nullable `branchId` for future extensibility
- UD-005 ✅ All monetary amounts stored as integers (smallest currency unit); Money utility required
- UD-006 ✅ Nullable `taxRate` (Decimal?) and `taxAmount` (Int?) on `SaleItem` and `Expense`; no tax logic
- Phase 1 complete

---

### 2.1 — PostgreSQL setup

**Type:** infra | **Risk:** medium

Set up a PostgreSQL database for development. Options:
- Local PostgreSQL installation
- Docker: `docker run --name bizdb -e POSTGRES_PASSWORD=... -p 5432:5432 -d postgres:16`
- Cloud: Neon free tier (recommended for easy branch-based dev DBs)

Add the connection string to `.env.local`.

---

### 2.2 — Prisma initialization

**Type:** db | **Risk:** low | **Blocks:** 2.3

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma`. The `prisma/` directory should be at the project root (not inside `src/`).

Create `src/server/db/prisma.ts` — the Prisma client singleton:

```typescript
// src/server/db/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

This pattern prevents multiple Prisma instances during Next.js hot reload.

---

### 2.3 — Core Prisma schema

**Type:** db | **Risk:** high | **Blocks:** everything in Phase 3+

This is the most important task in Phase 2. Design it carefully — migrations are cheap, but schema redesigns that require data migration are expensive.

The schema must cover all domain entities listed in ARCHITECTURE.md §8. Key constraints:

**General rules for all models:**
- `id String @id @default(uuid())` — UUID primary keys
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`
- `deletedAt DateTime?` on all financially significant records

**Identity / Tenancy models:**
```
User
  id            String    @id @default(uuid())
  firebaseUid   String    @unique
  name          String
  email         String?   @unique
  phone         String?
  status        UserStatus @default(ACTIVE)
  memberships   BusinessMember[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

Business
  id            String    @id @default(uuid())
  name          String
  type          String                          // clothing, electronics, etc.
  country       String                          // ISO 3166-1 alpha-2
  currency      String                          // ISO 4217
  phone         String?
  status        BusinessStatus @default(ACTIVE)
  members       BusinessMember[]
  branches      Branch[]
  products      Product[]
  accounts      FinancialAccount[]
  subscription  Subscription?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

Branch
  id            String    @id @default(uuid())
  businessId    String
  business      Business  @relation(...)
  name          String
  address       String?
  isDefault     Boolean   @default(false)
  status        BranchStatus @default(ACTIVE)
  members       BusinessMember[]
  sales         Sale[]
  expenses      Expense[]
  movements     InventoryMovement[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

BusinessMember
  id            String    @id @default(uuid())
  userId        String
  businessId    String
  role          UserRole
  branchAccess  BranchAccess[]   // which branches this member can access
  status        MemberStatus @default(ACTIVE)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([userId, businessId])
```

**Product / Inventory models:**
```
Category
  id            String    @id @default(uuid())
  businessId    String
  name          String
  description   String?
  createdAt/updatedAt

Product
  id            String    @id @default(uuid())
  businessId    String
  categoryId    String?
  name          String
  sku           String?
  barcode       String?
  brand         String?
  description   String?
  unit          String                          // pcs, kg, box, etc.
  costPrice     Int                             // smallest currency unit
  sellingPrice  Int                             // smallest currency unit
  minStockLevel Int       @default(0)
  status        ProductStatus @default(ACTIVE)
  createdAt/updatedAt/deletedAt

  @@unique([businessId, sku])
  @@unique([businessId, barcode])
  @@index([businessId])

InventoryMovement
  id            String    @id @default(uuid())
  productId     String
  branchId      String
  type          InventoryMovementType
  quantity      Int                             // positive or negative
  costPrice     Int?                            // cost at time of movement
  reference     String?                         // saleId, purchaseId, etc.
  notes         String?
  createdById   String
  syncOperationId String? @unique              // for idempotency
  createdAt     DateTime  @default(now())

  @@index([productId, branchId])
  @@index([branchId, createdAt])

StockSnapshot
  id            String    @id @default(uuid())
  productId     String
  branchId      String
  quantity      Int
  updatedAt     DateTime  @updatedAt

  @@unique([productId, branchId])
```

**Sales models:**
```
Sale
  id            String    @id @default(uuid())
  branchId      String
  createdById   String
  status        SaleStatus @default(COMPLETED)
  subtotal      Int                             // sum of item totals before discounts
  discountAmount Int       @default(0)
  finalTotal    Int                             // what was actually charged
  notes         String?
  syncOperationId String? @unique
  items         SaleItem[]
  payments      Payment[]
  returns       SaleReturn[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([branchId, createdAt])

SaleItem
  id            String    @id @default(uuid())
  saleId        String
  productId     String
  productName   String                          // snapshot at time of sale
  sku           String?                         // snapshot
  unitPrice     Int                             // actual price charged (snapshot)
  costPrice     Int                             // cost at time of sale (snapshot)
  quantity      Int
  discountAmount Int       @default(0)
  totalPrice    Int                             // (unitPrice - discount) * quantity

Payment
  id            String    @id @default(uuid())
  saleId        String
  accountId     String                          // FinancialAccount
  amount        Int
  createdAt     DateTime  @default(now())

SaleReturn
  id            String    @id @default(uuid())
  saleId        String
  branchId      String
  createdById   String
  reason        String?
  totalRefund   Int
  syncOperationId String? @unique
  items         SaleReturnItem[]
  createdAt     DateTime  @default(now())

SaleReturnItem
  id            String    @id @default(uuid())
  returnId      String
  saleItemId    String
  quantity      Int
  refundAmount  Int
```

**Expenses / Financial models:**
```
ExpenseCategory
  id            String    @id @default(uuid())
  businessId    String
  name          String                          // Rent, Electricity, etc.
  isDefault     Boolean   @default(false)

Expense
  id            String    @id @default(uuid())
  branchId      String
  categoryId    String
  accountId     String                          // FinancialAccount used
  amount        Int
  description   String?
  expenseDate   DateTime
  createdById   String
  syncOperationId String? @unique
  createdAt/updatedAt/deletedAt

  @@index([branchId, expenseDate])

FinancialAccount
  id            String    @id @default(uuid())
  businessId    String
  name          String                          // Cash, Telebirr, CBE, etc.
  type          AccountType                     // CASH, MOBILE_MONEY, BANK, OTHER
  currentBalance Int      @default(0)           // cache — reconstructible
  isDefault     Boolean   @default(false)
  status        AccountStatus @default(ACTIVE)
  transactions  FinancialTransaction[]
  createdAt/updatedAt

  @@index([businessId])

FinancialTransaction
  id            String    @id @default(uuid())
  accountId     String
  type          FinancialTransactionType
  amount        Int                             // always positive; type indicates direction
  balanceAfter  Int                             // running balance snapshot
  reference     String?                         // saleId, expenseId, etc.
  notes         String?
  createdAt     DateTime  @default(now())

  @@index([accountId, createdAt])
```

**Audit / Sync models:**
```
AuditLog
  id            String    @id @default(uuid())
  businessId    String
  userId        String
  action        String                          // SALE_CREATED, PRICE_CHANGED, etc.
  entityType    String
  entityId      String
  metadata      Json?
  createdAt     DateTime  @default(now())

  @@index([businessId, createdAt])
  @@index([entityType, entityId])

SyncOperation
  id            String    @id @default(uuid())
  syncOperationId String  @unique               // client-generated UUID
  clientId      String                          // device identifier
  userId        String
  businessId    String
  entityType    String
  entityId      String
  operationType String                          // CREATE, UPDATE, DELETE
  payload       Json
  status        SyncStatus @default(PENDING)
  retryCount    Int        @default(0)
  lastError     String?
  processedAt   DateTime?
  createdAt     DateTime  @default(now())

  @@index([businessId, status])
  @@index([syncOperationId])
```

**SaaS Billing models (separate — kept last):**
```
Plan
  id            String    @id @default(uuid())
  name          String    @unique               // STARTER, BUSINESS, PRO
  displayName   String
  isActive      Boolean   @default(true)
  features      PlanFeature[]
  limits        UsageLimit[]
  subscriptions Subscription[]

PlanFeature
  id            String    @id @default(uuid())
  planId        String
  featureKey    String                          // MULTI_BRANCH, ADVANCED_REPORTS, etc.
  enabled       Boolean   @default(true)

UsageLimit
  id            String    @id @default(uuid())
  planId        String
  limitKey      String                          // MAX_PRODUCTS, MAX_USERS, etc.
  value         Int                             // -1 = unlimited

Subscription
  id            String    @id @default(uuid())
  businessId    String    @unique
  planId        String
  status        SubscriptionStatus
  trialEndsAt   DateTime?
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelledAt   DateTime?
  createdAt/updatedAt

Invoice
  id            String    @id @default(uuid())
  businessId    String
  subscriptionId String
  amount        Int
  currency      String
  status        InvoiceStatus
  dueDate       DateTime
  paidAt        DateTime?
  createdAt     DateTime  @default(now())

PlatformPayment
  id            String    @id @default(uuid())
  invoiceId     String
  amount        Int
  currency      String
  method        String
  reference     String?
  status        PaymentStatus
  createdAt     DateTime  @default(now())
```

**All enums must be defined as Prisma enums**, not string fields, for type safety.

---

### 2.4 — Initial migration

**Type:** db | **Risk:** medium | **Blocks:** 2.5

```bash
npx prisma migrate dev --name initial_schema
```

**Verify:** Migration runs successfully. `npx prisma studio` opens and shows all tables.

---

### 2.5 — Prisma seed script

**Type:** db | **Risk:** low

Create `prisma/seed.ts`:
- Creates 3 plans (STARTER, BUSINESS, PRO) with features and limits
- Creates default expense categories
- Creates a test user, business, and branch for local development

Add seed script to `package.json`:
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

**Verify:** `npx prisma db seed` runs without errors.

---

### 2.6 — Export Prisma types

**Type:** db | **Risk:** low

After running `prisma generate`, Prisma generates types in `node_modules/@prisma/client`. Re-export the domain-relevant enums and types from `src/shared/types/` so service code imports from the shared layer, not directly from `@prisma/client`.

---

### Phase 2 completion checklist
- [ ] PostgreSQL running and accessible
- [ ] `prisma/schema.prisma` complete with all entities
- [ ] `src/server/db/prisma.ts` singleton created
- [ ] Migration runs cleanly (`npx prisma migrate dev`)
- [ ] Seed script runs (`npx prisma db seed`)
- [ ] `npx prisma studio` shows all tables
- [ ] All monetary amounts use `Int` (confirmed UD-005)
- [ ] Financial accounts scoped per-business (confirmed UD-004)

---

## Phase 3 — Identity and Tenancy

**Goal:** A working authentication flow (Firebase ↔ PostgreSQL), tenant context resolution, business onboarding, and role-based authorization guards.

**Prerequisites:**
- UD-002 ✅ Email/password + Google OAuth; phone OTP deferred; auth module must be extensible
- Phase 2 complete
- Firebase project created and credentials in `.env.local`

---

### 3.1 — Firebase Admin SDK initialization

**Type:** server | **Risk:** low | **Blocks:** 3.2

Create `src/server/auth/firebase-admin.ts`:
- Initialize Firebase Admin SDK using `process.env.FIREBASE_*` variables
- Export a singleton admin app instance
- Singleton guard prevents multiple initializations during hot reload

**Never** import this file from any `'use client'` component.

---

### 3.2 — Token verification utility

**Type:** server | **Risk:** low | **Blocks:** 3.3

Create `src/server/auth/verify-token.ts`:
- `verifyIdToken(token: string): Promise<DecodedIdToken>`
- Wraps Firebase Admin's `auth().verifyIdToken()`
- Maps Firebase errors to `AppError(UNAUTHORIZED)`

---

### 3.3 — TenantContext resolution

**Type:** server | **Risk:** high | **Blocks:** 3.4, 3.5, 4.x, 5.x, 6.x

Create `src/server/auth/resolve-context.ts`:
- `resolveContext(token: string, requiredBranchId?: string): Promise<TenantContext>`
- Calls `verifyIdToken` → gets `firebaseUid`
- Looks up `User` in PostgreSQL by `firebaseUid`
- Loads the user's `BusinessMember` record (must exist and be ACTIVE)
- If `requiredBranchId` is provided, verifies the user has access to that branch
- Constructs and returns `TenantContext`
- Throws `UNAUTHORIZED` if user not found or inactive
- Throws `FORBIDDEN` if branch access is not granted

```typescript
type TenantContext = {
  userId: string;
  firebaseUid: string;
  businessId: string;
  branchId: string;       // the active branch for this request
  role: UserRole;
};
```

This function is called at the top of every Server Action and Route Handler.

---

### 3.4 — Authorization helpers

**Type:** server | **Risk:** medium | **Blocks:** 4.x, 5.x, 6.x

Create `src/server/auth/permissions.ts`:

```typescript
// Throws AppError(FORBIDDEN) if the context does not satisfy the check
function requireRole(ctx: TenantContext, minRole: UserRole): void
function requireOwner(ctx: TenantContext): void
function requireOwnerOrManager(ctx: TenantContext): void
function canApplyPriceOverride(ctx: TenantContext): boolean
function canViewFinancialReports(ctx: TenantContext): boolean
function canManageUsers(ctx: TenantContext): boolean
// ... add others as needed
```

Role hierarchy: `OWNER > MANAGER > STAFF`

---

### 3.5 — Next.js Middleware (route guard)

**Type:** server | **Risk:** medium | **Blocks:** 3.6

Create `middleware.ts` at the project root:
- Applies to all routes under `/(dashboard)/`
- Reads the Firebase ID token from the `Authorization` header or a cookie
- Calls `verifyIdToken` — if invalid, redirects to `/login`
- Does NOT resolve full TenantContext here (too expensive per request) — that happens inside each Server Action / Route Handler

```typescript
// middleware.ts
export const config = {
  matcher: ['/app/:path*'],   // adjust to match the (dashboard) group
};
```

**Note:** The middleware only performs a fast token validity check. Business context resolution happens in the service layer.

---

### 3.6 — Firebase client SDK initialization

**Type:** client | **Risk:** low | **Blocks:** 3.7

Create `src/client/firebase/firebase-client.ts`:
- Initialize Firebase client SDK using `NEXT_PUBLIC_FIREBASE_*` variables
- Export `auth` instance
- Singleton guard

---

### 3.7 — Authentication UI (login / signup)

**Type:** ui | **Risk:** medium | **Blocks:** 3.8

Create pages:
- `app/(auth)/login/page.tsx` — login form
- `app/(auth)/signup/page.tsx` — signup form

UI requirements:
- Email + password inputs with proper labels and validation
- Clear error messages (wrong password, email not found, etc.)
- "Sign in" redirects to `/onboarding` if user has no business, or `/app` if they do
- No decorative elements — functional, accessible form
- Optionally: phone OTP option (pending UD-002)

On successful Firebase sign-in:
1. Get ID token from Firebase
2. Call a Server Action to upsert the `User` record in PostgreSQL
3. Redirect

---

### 3.8 — Business onboarding flow

**Type:** ui + server | **Risk:** medium | **Blocks:** 3.9

Pages:
- `app/(auth)/onboarding/page.tsx` — business creation form

Steps:
1. User is authenticated (Firebase)
2. Form: business name, business type, country (dropdown), currency (dropdown), optional phone
3. On submit → Server Action `createBusiness()`:
   - Creates `Business` record
   - Creates `BusinessMember` record (role: OWNER)
   - Creates default `Branch` record (name: "Main Branch" or user-provided)
   - Creates default `FinancialAccount` records (Cash, Telebirr — or based on country config)
   - Creates default `ExpenseCategory` records (Rent, Electricity, etc.)
   - Creates `Subscription` in TRIAL status (14 days)
4. Redirect to `/app`

The form must not require unnecessary information. Business type and currency should have pre-set options appropriate for the target market, but the dropdowns must include "Other" and all major options.

**Server Action validation:** Use Zod schema for all inputs. Return structured errors, not generic messages.

---

### 3.9 — User management (OWNER only)

**Type:** ui + server | **Risk:** medium

Page: `app/(dashboard)/settings/users/`

- List members of the business
- Invite a new user (by email — they receive a Firebase invite)
- Assign role (OWNER/MANAGER/STAFF)
- Deactivate a member

This is a Phase 3 feature but it can be simplified — at minimum allow the OWNER to see who has access. Invitation flow can be a stub initially.

---

### Phase 3 completion checklist
- [ ] Firebase Admin SDK initializes without errors
- [ ] Token verification works (tested manually or with a unit test)
- [ ] `resolveContext()` correctly rejects invalid tokens and wrong tenant
- [ ] Middleware redirects unauthenticated users from `/app/*`
- [ ] Login page works — signs in a user
- [ ] Signup page works — creates a Firebase user
- [ ] Onboarding flow creates Business, Branch, Accounts, Subscription in one transaction
- [ ] OWNER role is assigned correctly
- [ ] Default financial accounts and expense categories are created
- [ ] Cannot access `/app` routes without authentication

---

## Phase 4 — Products and Inventory

**Goal:** Products can be created, edited, and browsed. Inventory movements are recorded. Current stock is queryable.

**Prerequisites:**
- UD-007 resolved (barcode scanning hardware)
- Phase 3 complete

---

### 4.1 — Product service

**Type:** server | **Risk:** low | **Blocks:** 4.2, 4.3, 5.x

Create `src/server/services/product.service.ts`:

```typescript
createProduct(ctx: TenantContext, input: CreateProductInput): Promise<Product>
updateProduct(ctx: TenantContext, productId: string, input: UpdateProductInput): Promise<Product>
archiveProduct(ctx: TenantContext, productId: string): Promise<void>
getProduct(ctx: TenantContext, productId: string): Promise<Product>
listProducts(ctx: TenantContext, filters: ProductFilters): Promise<PaginatedResult<Product>>
searchProducts(ctx: TenantContext, query: string): Promise<Product[]>  // for POS
findByBarcode(ctx: TenantContext, barcode: string): Promise<Product | null>
findBySku(ctx: TenantContext, sku: string): Promise<Product | null>
```

All functions must verify `product.businessId === ctx.businessId`.

---

### 4.2 — Inventory service

**Type:** server | **Risk:** medium | **Blocks:** 4.3, 5.x

Create `src/server/services/inventory.service.ts`:

```typescript
recordMovement(ctx: TenantContext, input: RecordMovementInput): Promise<InventoryMovement>
getStockLevel(ctx: TenantContext, productId: string, branchId: string): Promise<number>
getStockLevels(ctx: TenantContext, branchId: string): Promise<StockLevel[]>
adjustStock(ctx: TenantContext, input: ManualAdjustInput): Promise<void>
getLowStockProducts(ctx: TenantContext, branchId: string): Promise<LowStockProduct[]>
```

`getStockLevel` first reads `StockSnapshot` for performance. If no snapshot exists, it falls back to summing `InventoryMovement` records and creates the snapshot.

---

### 4.3 — Product and inventory UI

**Type:** ui | **Risk:** medium

Pages:
- `app/(dashboard)/products/page.tsx` — product list (table, search, filter by category)
- `app/(dashboard)/products/new/page.tsx` — create product form
- `app/(dashboard)/products/[id]/page.tsx` — product detail + edit
- `app/(dashboard)/inventory/page.tsx` — stock levels by branch
- `app/(dashboard)/inventory/adjust/page.tsx` — manual stock adjustment

UI requirements:
- Product list: compact table, SKU, name, category, stock (from snapshot), cost, price
- Search must be fast (debounced, hits the server-side `searchProducts` action)
- Clear empty state when no products exist
- Product form: all required fields with validation feedback
- Stock adjust: product, branch, quantity delta, type (PURCHASE / DAMAGE / MANUAL), notes

---

### 4.4 — Category management

**Type:** server + ui | **Risk:** low

Create `src/server/services/product.service.ts` category functions:
- `createCategory`, `listCategories`, `updateCategory`

UI: Simple category list page under product settings. This can be minimal — a table with an "Add category" button.

---

### Phase 4 completion checklist
- [ ] Products can be created, edited, and archived
- [ ] Product search works by name, SKU, and barcode
- [ ] Stock levels are visible per product per branch
- [ ] Manual inventory adjustment works with movement record created
- [ ] All product queries are scoped to `ctx.businessId`
- [ ] `StockSnapshot` is updated on every movement
- [ ] Low-stock query correctly uses `minStockLevel`

---

## Phase 5 — Sales / POS

**Goal:** A shopkeeper can complete a sale in under 10 seconds. Sales are saved atomically to the database with inventory reduction and financial account update.

**Prerequisites:** Phase 4 complete

---

### 5.1 — Sale service

**Type:** server | **Risk:** high | **Blocks:** 5.2, 5.3

Create `src/server/services/sale.service.ts`:

```typescript
createSale(ctx: TenantContext, input: CreateSaleInput): Promise<Sale>
getSale(ctx: TenantContext, saleId: string): Promise<SaleWithItems>
listSales(ctx: TenantContext, filters: SaleFilters): Promise<PaginatedResult<Sale>>
getTodaysSummary(ctx: TenantContext, branchId: string): Promise<DaySummary>
```

`createSale` must execute as a single Prisma transaction:
1. Validate all items exist and belong to `ctx.businessId`
2. Validate payment accounts belong to `ctx.businessId`
3. If price override on any item, check `canApplyPriceOverride(ctx)`
4. Insert `Sale` record
5. Insert `SaleItem` records (snapshot `productName`, `unitPrice`, `costPrice`)
6. Insert `Payment` record(s)
7. Insert `InventoryMovement` record(s) (type: SALE, negative quantity, syncOperationId for idempotency)
8. Upsert `StockSnapshot` for affected products
9. Insert `FinancialTransaction` record(s) (type: SALE_PAYMENT, debit account)
10. Update `FinancialAccount.currentBalance` (cache)
11. Insert `AuditLog` entry

If any step fails, the entire transaction is rolled back.

---

### 5.2 — POS cart (client state)

**Type:** client | **Risk:** medium | **Blocks:** 5.3

Create `src/client/hooks/use-sale-cart.ts`:

The cart is a client-side state machine. It should be a React hook (or Zustand store — decide consistently) managing:
```typescript
type CartItem = {
  productId: string;
  productName: string;
  sku: string | null;
  unitPrice: number;       // can be overridden
  costPrice: number;
  quantity: number;
  discountAmount: number;
  totalPrice: number;      // derived
};

type Cart = {
  items: CartItem[];
  discountAmount: number;  // sale-level
  subtotal: number;        // derived
  finalTotal: number;      // derived
};
```

Operations: `addItem`, `removeItem`, `updateQuantity`, `setItemPrice`, `setItemDiscount`, `setSaleDiscount`, `clearCart`.

No server call happens while building the cart. The server is only called on "Complete Sale".

---

### 5.3 — POS UI

**Type:** ui | **Risk:** high

Page: `app/(dashboard)/sell/page.tsx`

This is the most important UI screen in the product. Design requirements:

**Layout (desktop):**
```
┌─────────────────────┬────────────────────────┐
│  Product Search     │  Cart                  │
│  ─────────────────  │  ─────────────────     │
│  [search input]     │  Item 1  qty  price    │
│  [product grid or   │  Item 2  qty  price    │
│   list for quick    │  ...                   │
│   selection]        │  ─────────────────     │
│                     │  Subtotal: ...         │
│                     │  Discount: ...         │
│                     │  TOTAL: ...            │
│                     │                        │
│                     │  [Complete Sale]       │
└─────────────────────┴────────────────────────┘
```

**Layout (mobile):**
- Tabs: "Search" | "Cart" — or stacked vertically
- "Complete Sale" must always be visible (sticky footer on mobile)
- Large touch targets

**Product search:**
- Instant search as the user types (debounced, 200ms)
- Tapping a product adds it to the cart immediately
- Barcode scan input (same text field — hardware scanner sends Enter after the barcode)
- Entering a barcode string finds the product

**Cart interaction:**
- Tapping quantity shows a numeric input
- Swipe-to-remove on mobile
- Item price override (OWNER/MANAGER only — shown conditionally)
- Discount input
- Clear cart button

**Complete Sale flow:**
1. Tap "Complete Sale"
2. Payment account selector (show balance next to each account)
3. Amount confirmation
4. Submit → Server Action `createSale()`
5. Success: clear cart, show sale total briefly, return to sell screen
6. Error: show specific error, keep cart intact

---

### 5.4 — Sale history

**Type:** ui | **Risk:** low

Page: `app/(dashboard)/sell/history/page.tsx` (or similar)
- List of sales for the branch, today by default
- Filters: date range, payment account
- Click a sale to see detail (items, payments, total)

---

### Phase 5 completion checklist
- [ ] `createSale` executes atomically (transaction)
- [ ] Inventory is reduced on sale
- [ ] Financial account balance is updated on sale
- [ ] Cart builds correctly in client state (no server round-trip per item)
- [ ] Product search works by name and barcode
- [ ] Sale history shows correct data
- [ ] Price override requires OWNER/MANAGER
- [ ] Payment from the correct financial account
- [ ] All amounts are correct (no floating-point arithmetic — use integers)

---

## Phase 6 — Expenses and Financial Accounts

**Goal:** Record business expenses. View and manage financial account balances. Transfer money between accounts.

**Prerequisites:** Phase 5 complete (financial account model already created)

---

### 6.1 — Financial account service

**Type:** server | **Risk:** medium | **Blocks:** 6.2, 6.3

Create `src/server/services/financial.service.ts`:

```typescript
listAccounts(ctx: TenantContext): Promise<FinancialAccount[]>
getAccountBalance(ctx: TenantContext, accountId: string): Promise<number>
transferFunds(ctx: TenantContext, input: TransferInput): Promise<void>
adjustAccount(ctx: TenantContext, input: AdjustInput): Promise<void>
getAccountTransactions(ctx: TenantContext, accountId: string, filters: DateFilters): Promise<FinancialTransaction[]>
```

`transferFunds` is a Prisma transaction:
1. Debit source account (create `FinancialTransaction` type: TRANSFER_OUT)
2. Credit destination account (create `FinancialTransaction` type: TRANSFER_IN)
3. Update both `currentBalance` fields

A transfer does **not** create revenue. It does not touch `Sale` or `Expense` tables.

---

### 6.2 — Expense service

**Type:** server | **Risk:** low | **Blocks:** 6.3

Create `src/server/services/expense.service.ts`:

```typescript
recordExpense(ctx: TenantContext, input: RecordExpenseInput): Promise<Expense>
listExpenses(ctx: TenantContext, filters: ExpenseFilters): Promise<PaginatedResult<Expense>>
getExpense(ctx: TenantContext, expenseId: string): Promise<Expense>
updateExpense(ctx: TenantContext, expenseId: string, input: UpdateExpenseInput): Promise<Expense>
deleteExpense(ctx: TenantContext, expenseId: string): Promise<void>   // soft-delete only
```

`recordExpense` executes as a transaction:
1. Insert `Expense` record
2. Insert `FinancialTransaction` (type: EXPENSE_PAYMENT, credit — balance decreases)
3. Update `FinancialAccount.currentBalance`
4. Insert `AuditLog`

---

### 6.3 — Expense and account UI

**Type:** ui | **Risk:** medium

Pages:
- `app/(dashboard)/expenses/page.tsx` — expense list with date filter
- `app/(dashboard)/expenses/new/page.tsx` — record expense form
- `app/(dashboard)/accounts/page.tsx` — account list with balances
- `app/(dashboard)/accounts/transfer/page.tsx` — fund transfer form

The expense form should be simple: category (dropdown), amount, description, date, payment account. Should take under 30 seconds to complete.

---

### Phase 6 completion checklist
- [ ] Expense recording reduces financial account balance
- [ ] Transfer moves balance between accounts without generating revenue
- [ ] Account balances are correct after multiple transactions
- [ ] Expense list filters by date range
- [ ] Cannot record expense from an account belonging to a different business

---

## Phase 7 — Reports

**Goal:** The dashboard answers real business questions. Core reports (sales, expenses, profit, inventory) are accurate and fast.

**Prerequisites:** Phase 6 complete

---

### 7.1 — Report service

**Type:** server | **Risk:** medium | **Blocks:** 7.2

Create `src/server/services/report.service.ts`:

```typescript
getDashboardSummary(ctx: TenantContext, branchId: string, date: Date): Promise<DashboardSummary>
getSalesReport(ctx: TenantContext, filters: ReportFilters): Promise<SalesReport>
getProfitReport(ctx: TenantContext, filters: ReportFilters): Promise<ProfitReport>
getExpenseReport(ctx: TenantContext, filters: ReportFilters): Promise<ExpenseReport>
getInventoryReport(ctx: TenantContext, branchId: string): Promise<InventoryReport>
getAccountBalances(ctx: TenantContext): Promise<AccountBalance[]>
```

`DashboardSummary` must return:
- `todaysRevenue` — sum of `Sale.finalTotal` for today (branchId + date scoped)
- `todaysSalesCount` — count of completed sales
- `grossProfit` — revenue − COGS (sum of `SaleItem.costPrice × SaleItem.quantity`)
- `todaysExpenses` — sum of `Expense.amount` for today
- `netProfit` — grossProfit − todaysExpenses
- `accountBalances` — array of `{ accountName, balance }` for all accounts
- `inventoryValue` — sum of `StockSnapshot.quantity × Product.costPrice`
- `lowStockCount` — count of products below `minStockLevel`

All calculations derive from transactional records. No derived/cached columns used for authoritative report data.

`ProfitReport` must clearly separate:
- Revenue
- COGS
- Gross Profit
- Expenses (broken down by category)
- Net Operating Profit

---

### 7.2 — Dashboard UI

**Type:** ui | **Risk:** medium

Page: `app/(dashboard)/page.tsx` (root of the authenticated section)

Requirements:
- Show `DashboardSummary` data in a clean, readable layout
- Numbers are the hero — not charts (charts only if they answer a specific question)
- Low-stock warning: click through to inventory report
- Account balances: click through to account detail
- Date filters: Today / Yesterday / This Week / This Month
- Must load quickly — use Next.js streaming (Suspense boundaries per section) so above-the-fold data appears first

---

### 7.3 — Report pages

**Type:** ui | **Risk:** medium

Pages:
- `app/(dashboard)/reports/sales/` — sales report with date range
- `app/(dashboard)/reports/profit/` — P&L report (revenue, COGS, gross, expenses, net)
- `app/(dashboard)/reports/expenses/` — expenses by category
- `app/(dashboard)/reports/inventory/` — stock levels, inventory value, low-stock list

Each report page must:
- Show a clear date range selector (presets + custom)
- Display data in a compact, readable table
- Show totals clearly
- Handle empty state (no sales, no expenses) gracefully

---

### Phase 7 completion checklist
- [ ] Dashboard shows correct revenue for today
- [ ] Gross profit correctly separates revenue from COGS
- [ ] Net profit correctly subtracts expenses
- [ ] Account balances match transaction history
- [ ] Transfer does NOT appear as revenue in the profit report
- [ ] Low-stock products correctly identified
- [ ] Reports produce correct numbers for a known test dataset
- [ ] All figures are in the correct currency unit

---

## Phase 8 — Returns

**Goal:** Completed sales can be returned (fully or partially). Inventory is restored. Financial accounts are credited.

**Prerequisites:** Phase 7 complete

---

### 8.1 — Return service

**Type:** server | **Risk:** high | **Blocks:** 8.2

Create `src/server/services/sale.service.ts` — add return functions:

```typescript
returnSale(ctx: TenantContext, input: ReturnSaleInput): Promise<SaleReturn>
```

`returnSale` must execute as a single Prisma transaction:
1. Validate `saleId` belongs to `ctx.branchId`
2. Validate `returnedItems` — each `saleItemId` must belong to the sale
3. Validate return quantities: `returnQuantity ≤ (originalQuantity − alreadyReturnedQuantity)`
4. Insert `SaleReturn` record
5. Insert `SaleReturnItem` records
6. Insert `InventoryMovement` records (type: SALE_RETURN, positive quantity)
7. Update `StockSnapshot`
8. Insert `FinancialTransaction` records (type: REFUND, credit the original payment account)
9. Update `FinancialAccount.currentBalance`
10. Insert `AuditLog`

The original `Sale` record is **never modified or deleted**.

---

### 8.2 — Return UI

**Type:** ui | **Risk:** medium

Pages:
- `app/(dashboard)/sell/history/[saleId]/return/page.tsx`

Flow:
1. Navigate to a sale's detail page
2. Click "Return"
3. Select items and quantities to return
4. Confirm
5. Refund goes to original payment account(s)

---

### Phase 8 completion checklist
- [ ] Partial returns work correctly
- [ ] Cannot return more than was sold (service-layer validation)
- [ ] Original sale record is unchanged
- [ ] Inventory is restored on return
- [ ] Financial account is credited on return
- [ ] Return shows in sale history as a linked record

---

## Phase 9 — Offline / Sync

**Goal:** The core operations (sale, expense, inventory check) work without an internet connection. Mutations queue and sync when connectivity returns.

**Prerequisites:**
- UD-001 resolved (negative stock handling)
- Phase 8 complete

---

### 9.1 — Dexie schema

**Type:** client | **Risk:** high | **Blocks:** 9.2, 9.3

Create `src/client/db/dexie.ts`:

Define the local Dexie database with tables mirroring the core server entities:
- `products` — local replica (synced from server)
- `inventoryLevels` — `StockSnapshot` equivalent
- `pendingSales` — sales created offline, not yet synced
- `pendingExpenses` — expenses created offline
- `syncQueue` — `SyncOperation` records

Define a `SyncOperation` type matching the server-side schema.

Versioning: Start at version 1. Future schema changes must use Dexie migrations.

---

### 9.2 — Sync queue processor

**Type:** client | **Risk:** high | **Blocks:** 9.3

Create `src/client/db/sync-queue.ts`:

```typescript
enqueue(operation: PendingSyncOperation): Promise<void>
processQueue(): Promise<SyncResult>
clearAcknowledged(): Promise<void>
```

`processQueue`:
- Only runs when `navigator.onLine` is true (or `useOffline` reports online)
- Takes PENDING operations in `createdAt` order
- Calls `POST /api/sync/batch` with a batch of operations
- Marks each as ACKNOWLEDGED or FAILED based on server response
- Runs automatically every 30 seconds via `setInterval`
- Also runs immediately when the browser fires the `online` event

---

### 9.3 — Sync batch API endpoint

**Type:** server | **Risk:** high

Create `app/api/sync/batch/route.ts` (Route Handler):

```typescript
POST /api/sync/batch
Body: { operations: SyncOperation[] }
Response: { results: SyncOperationResult[] }
```

Server-side processing:
1. Verify Firebase token (same as all protected endpoints)
2. For each operation:
   a. Check `syncOperationId` in `SyncOperation` table — if already processed, return the original result (idempotent)
   b. Validate payload with Zod schema
   c. Execute the operation (call the appropriate service function)
   d. Record the `SyncOperation` in the database
   e. Return result (success / error / conflict)
3. Return batch results

---

### 9.4 — Local-first mutations in the POS

**Type:** client | **Risk:** medium

Modify `createSale` flow in the POS to:
1. Save to Dexie first (immediate local confirmation — "Sale completed")
2. If online: also submit to Server Action immediately
3. If offline: enqueue in `syncQueue` — show "Offline — will sync" indicator
4. When connectivity returns: sync queue processor submits

The user experience is: "Sale completed" appears immediately in both cases.

---

### 9.5 — Product sync (server → client)

**Type:** client | **Risk:** medium

On app load and periodically:
1. Fetch product list from the server (delta sync using `updatedAfter` timestamp)
2. Upsert into local Dexie `products` table
3. Fetch stock levels for the current branch
4. Upsert into local `inventoryLevels` table

This ensures the POS has a fresh product list even during periods of good connectivity.

---

### 9.6 — Offline UI indicators

**Type:** client | **Risk:** low

Implement the `OfflineBanner` stub from Phase 1 and a `useOfflineStatus` hook:
- Custom hook in `src/client/hooks/use-offline-status.ts`
- Detects connectivity via browser `online`/`offline` events + a lightweight `HEAD` probe to the app origin
- Does NOT use `next/offline` or `experimental.useOffline`
- Show a clear, non-intrusive banner when offline
- Show sync status (n operations pending)
- Green indicator when all synced

---

### Phase 9 completion checklist
- [ ] Sale can be completed with no internet connection
- [ ] Sale syncs to server when connectivity returns
- [ ] `syncOperationId` prevents duplicate sales on retry
- [ ] Expense can be recorded offline and synced
- [ ] Product catalog available offline (local replica)
- [ ] Stock levels visible offline (approximate)
- [ ] Sync queue shows status to the user
- [ ] Negative stock scenario handled per UD-001 decision
- [ ] All synced sales appear in reports after sync

---

## Phase 10 — PWA / Mobile

**Goal:** The application is installable as a PWA, works well on mobile phones, and delivers a useful mobile-first POS experience.

**Prerequisites:** Phase 9 complete

---

### 10.1 — PWA icons and manifest

**Type:** infra | **Risk:** low

- Create proper app icons in required sizes (192×192, 512×512, maskable)
- Update `app/manifest.ts` with real app name, description, icons, `start_url`, `display: 'standalone'`
- Verify installability in Chrome DevTools

---

### 10.2 — Service worker (Serwist)

**Type:** infra | **Risk:** medium

Install and configure Serwist for Next.js:
- Precache the app shell (static HTML, CSS, JS)
- Runtime caching for product images and static assets
- The offline fallback page

The combination of Serwist (service worker shell caching) + Dexie (business data offline) + `experimental.useOffline` (framework retry) provides full offline capability.

---

### 10.3 — Mobile navigation

**Type:** ui | **Risk:** medium

Add bottom navigation for mobile viewports (≤ 768px):
- Tabs: Sell | Dashboard | Products | Expenses | Reports

Desktop: sidebar navigation (existing)

Navigation must be context-aware (highlight current section) and accessible (ARIA roles, keyboard navigation).

---

### 10.4 — Mobile POS optimization

**Type:** ui | **Risk:** medium

Review the POS screen on a 375px viewport:
- Large touch targets (minimum 44×44px)
- Numeric keypad for quantity input
- Cart items that can be dismissed with a tap-and-hold or swipe
- "Complete Sale" always visible, never buried
- Fast product search with a large input field

---

### 10.5 — Push notifications (FCM)

**Type:** server + client | **Risk:** medium

Implement low-stock push notifications:
- After a sale syncs, check if any product went below `minStockLevel`
- If yes, send FCM push notification to all OWNER/MANAGER members of the business
- Notification: "Low stock: [Product Name] — [X] units remaining"

Requires VAPID keys and service worker push handler (from Next.js PWA guide).

---

### Phase 10 completion checklist
- [ ] App is installable from Chrome and Safari (iOS)
- [ ] Installed app loads from home screen without a browser URL bar
- [ ] Mobile POS works on a 375px screen
- [ ] Bottom navigation present on mobile
- [ ] Low-stock push notification fires after relevant sale
- [ ] App loads a shell page when offline (via service worker)

---

## Phase 11 — SaaS Billing

**Prerequisites:**
- UD-003 resolved (payment gateway)
- Phase 10 complete

---

### 11.1 — Entitlement enforcement

**Type:** server | **Risk:** medium | **Blocks:** 11.2

Create `src/server/services/subscription.service.ts`:

```typescript
checkFeatureEntitlement(ctx: TenantContext, featureKey: string): Promise<void>  // throws SUBSCRIPTION_LIMIT if not entitled
checkUsageLimit(ctx: TenantContext, limitKey: string, currentUsage: number): Promise<void>
getSubscription(ctx: TenantContext): Promise<Subscription>
```

`checkFeatureEntitlement` is called at the top of service functions for gated features. It consults the `Subscription → Plan → PlanFeature` chain. If the subscription is expired, gated features are blocked.

---

### 11.2 — Trial subscription

**Type:** server | **Risk:** low

Implemented in Phase 3 (`createBusiness` creates a TRIAL subscription). In Phase 11:
- Add a trial expiry check to the middleware or a shared layout component
- Show a trial expiry warning banner (e.g., "5 days remaining in trial")
- After trial expires: block gated features, show upgrade prompt

---

### 11.3 — Subscription management UI

**Type:** ui | **Risk:** medium

Page: `app/(dashboard)/settings/subscription/page.tsx`

- Current plan and status
- Trial days remaining (if in trial)
- Plan comparison table
- "Upgrade" button (placeholder — awaiting UD-003 for actual payment integration)
- Billing history (invoices)

---

### Phase 11 completion checklist
- [ ] Trial subscription created on business creation
- [ ] Trial expiry correctly blocks gated features
- [ ] Feature entitlement check correctly allows/blocks by plan
- [ ] Subscription page shows correct status
- [ ] Billing is completely separate from merchant finances

---

## Phase 12 — Testing and Hardening

**Prerequisites:** Phase 11 complete (or run in parallel with Phase 10/11)

---

### 12.1 — Unit tests: service layer

**Type:** test | **Risk:** low

Cover:
- `createSale` — correct totals, correct inventory reduction, correct financial transaction
- `returnSale` — partial return validation, inventory restoration, refund calculation
- `recordExpense` — balance reduction, correct transaction type
- `transferFunds` — balance transfer correctness, no revenue generated
- `getDashboardSummary` — revenue ≠ profit ≠ balance
- `checkEntitlement` — plan feature gates

---

### 12.2 — Integration tests: authorization

**Type:** test | **Risk:** low

Cover:
- STAFF cannot view financial reports
- STAFF cannot apply price override
- User from Business A cannot access data from Business B (cross-tenant)
- OWNER can do everything within their business
- Expired subscription blocks gated features
- Invalid Firebase token rejected with 401

---

### 12.3 — Integration tests: sync idempotency

**Type:** test | **Risk:** low

Cover:
- Submitting the same `syncOperationId` twice creates only one sale
- Submitting the same expense `syncOperationId` twice creates only one expense
- Batch with mixed new and duplicate operations handles each correctly

---

### 12.4 — E2E tests (Playwright)

**Type:** test | **Risk:** medium

Cover:
- Sign up → create business → complete first sale → check dashboard
- Record expense → check account balance reduced
- Complete sale → return partial items → check inventory restored
- Go offline → complete sale → come back online → verify synced

---

### 12.5 — Security review

**Type:** infra | **Risk:** high

Manually verify:
- No `NEXT_PUBLIC_*` variable contains Firebase Admin secrets
- Every Server Action resolves `TenantContext` before any data access
- Every Route Handler validates the Firebase token
- No `businessId` is read from request body/query without validation against the resolved context
- All Zod schemas are applied before service function calls
- `syncOperationId` unique index exists on `SyncOperation` table
- Prisma `@map` field names don't leak internal column names

---

### 12.6 — Performance review

**Type:** infra | **Risk:** medium

- Run `next build` and review the bundle analysis output
- Identify any client-side bundles that are too large
- Verify product search query uses the correct indexes (`businessId`, `sku`, `barcode`)
- Verify dashboard queries have `createdAt` range indexes
- Ensure Prisma connection pooling is configured for the deployment environment (Prisma Accelerate or PgBouncer)

---

### Phase 12 completion checklist
- [ ] Service layer tests pass
- [ ] Authorization tests cover all role boundaries
- [ ] Sync idempotency tests pass
- [ ] E2E sale flow test passes
- [ ] No secrets in client-side environment variables
- [ ] All Server Actions resolve TenantContext before data access
- [ ] `npm run build` produces no TypeScript errors
- [ ] `npm run lint` produces no errors

---

## Dependency Summary

```
Phase 0 (audit)
  └── Phase 1 (foundation)
        └── Phase 2 (database)          ← requires UD-004, UD-005, UD-006
              └── Phase 3 (auth)        ← requires UD-002 + Firebase project
                    └── Phase 4 (products + inventory)   ← requires UD-007
                          └── Phase 5 (sales/POS)
                                └── Phase 6 (expenses + accounts)
                                      └── Phase 7 (reports)
                                            └── Phase 8 (returns)
                                                  └── Phase 9 (offline)  ← requires UD-001
                                                        └── Phase 10 (PWA/mobile)
                                                              └── Phase 11 (SaaS)  ← requires UD-003
                                                                    └── Phase 12 (testing)
```

Phases 11 and 12 can be worked on partially in parallel with Phases 9 and 10.

---

## Decisions Status Before Development Begins

**All four pre-development decisions are resolved:**

| Decision | Resolution |
|---|---|
| UD-002 (auth methods) | ✅ Email/password + Google OAuth. Phone OTP deferred. |
| UD-004 (account scope) | ✅ Per-business. Nullable `branchId` for future extensibility. |
| UD-005 (money storage) | ✅ Integer, smallest currency unit. `src/shared/money.ts` utility required. |
| UD-006 (tax in schema) | ✅ Nullable `taxRate` + `taxAmount` columns only. No tax logic. |

**Decisions still pending (required later):**

| Decision | Required before |
|---|---|
| UD-001 (negative stock handling) | Phase 9 |
| UD-003 (subscription payment gateway) | Phase 11 |
| UD-007 (barcode scanning hardware) | Phase 4 |

---

## First Recommended Phase

**Start with Phase 1 — Foundation**, immediately after the four pre-development decisions above are answered.

Phase 1 has no significant unknowns, changes only infrastructure configuration, and can be completed in one focused session. It sets up the project structure, installs all needed packages, and creates the error handling foundation that every subsequent phase depends on.

**Estimated Phase 1 scope:** approximately 8–12 concrete tasks, all low-to-medium risk, fully reversible.

After Phase 1 is reviewed and approved, Phase 2 (database schema) should be reviewed before the migration is run — the schema is the hardest thing to change later.
