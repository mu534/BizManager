# Architecture Document
## Business Management SaaS Platform

**Version:** 0.1 — Pre-implementation  
**Status:** Approved for Phase 1 development  
**Last updated:** 2026-10-08

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Domain Boundaries](#4-domain-boundaries)
5. [Multi-Tenancy Strategy](#5-multi-tenancy-strategy)
6. [Authentication Strategy](#6-authentication-strategy)
7. [Authorization Strategy](#7-authorization-strategy)
8. [Database Strategy](#8-database-strategy)
9. [Inventory Strategy](#9-inventory-strategy)
10. [Sales Strategy](#10-sales-strategy)
11. [Financial Model](#11-financial-model)
12. [Offline-First Strategy](#12-offline-first-strategy)
13. [Synchronization Strategy](#13-synchronization-strategy)
14. [Conflict Resolution Strategy](#14-conflict-resolution-strategy)
15. [SaaS Billing Architecture](#15-saas-billing-architecture)
16. [Security Principles](#16-security-principles)
17. [Testing Strategy](#17-testing-strategy)
18. [Proposed Project Structure](#18-proposed-project-structure)
19. [Development Phases](#19-development-phases)
20. [Important Architectural Decisions](#20-important-architectural-decisions)
21. [Known Risks and Unresolved Decisions](#21-known-risks-and-unresolved-decisions)

---

## 1. Product Overview

A multi-tenant SaaS business management platform for small and medium-sized retail businesses. The initial target market is Ethiopia, but the architecture does not encode Ethiopia-specific assumptions — country, currency, tax rules, and locale are all per-business configuration.

### Target business types (initial)
- Clothing shops
- Shoe shops
- Electronics shops
- Grocery shops
- Cosmetics shops
- General retail stores

### Core questions the product answers daily
1. What products do I have?
2. What did I sell today?
3. How much money came in?
4. Where did the money come from?
5. What expenses did I have?
6. How much profit did I make?
7. Which products are running low?
8. How much inventory do I have?
9. How is my business performing overall?

### MVP scope
**Inventory → Sales/POS → Expenses → Financial Accounts → Basic Profit Reports**

The interface must be fast enough for a complete sale in 3–10 seconds once the user is familiar. The backend can be sophisticated, but the shopkeeper's daily experience must remain simple.

---

## 2. Technology Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.4.0 | Already installed. App Router only. |
| Language | TypeScript 5 (strict) | Already configured. `any` is forbidden. |
| Styling | Tailwind CSS 4 | Already installed via `@tailwindcss/turbopack`. |
| Linting | ESLint 9 + `eslint-config-next` | Already configured. |
| Database | PostgreSQL | Source of truth for all transactional business data. |
| ORM | Prisma 6.19.3 | Latest stable v6. Prisma v7+ has known Next.js 16 + Turbopack incompatibilities — do not upgrade until a dedicated migration step. |
| Auth | Firebase Authentication | Identity only. Business authorization is in PostgreSQL. |
| Firebase client SDK | firebase 11.10.0 | Auth + FCM client. v11 latest stable. |
| Firebase server SDK | firebase-admin 14.5.0 | Server-side token verification. v14 latest stable. |
| Push notifications | Firebase Cloud Messaging | For low-stock alerts, sync confirmations, etc. |
| Local storage | Dexie.js 4.4.6 + IndexedDB | Offline-capable local database in the browser. |
| PWA | Next.js manifest + service worker (Serwist) | Installability, offline shell, push. |
| Offline UX | Custom `useOfflineStatus` hook (Phase 9) | Browser `online`/`offline` events + HTTP probe. No dependency on experimental Next.js features. |
| Validation | Zod 4.6.5 | Server-side and client-side input validation. Note: v4 API — not compatible with v3 patterns. |
| Testing | Vitest 3.2.4 + Playwright 1.52.0 | Unit/integration and E2E. |

### Important Next.js 16 facts for this project
- `cacheComponents: true` and `partialPrefetching: true` are already set in `next.config.ts`. This means **data fetching is dynamic by default** and we opt-in to caching with `use cache` directives. This replaces `unstable_cache`, `getStaticProps`, and explicit ISR.
- **Prisma version locked to v6.** Prisma v7+ has documented incompatibilities with Next.js 16 + Turbopack (module resolution errors with the new `prisma-client` generator). Use `prisma@6.19.3` / `@prisma/client@6.19.3`. Do not upgrade to v7 or v8 without a dedicated migration step that verifies Turbopack compatibility.
- `experimental.agentFeedback: true` is set — leave it in place.
- `experimental.useOffline` is **not used**. Our offline-first architecture is based on Dexie.js + IndexedDB + an explicit sync queue, which is a self-contained approach that does not depend on any experimental Next.js framework feature. See §12 (Offline-First Strategy).
- PPR (Partial Prerendering) is the default behavior when `cacheComponents` is enabled. No `experimental.ppr` flag needed.
- Server Actions are stable and the preferred mutation pattern over separate API routes for most operations. Route Handlers remain appropriate for webhook endpoints and REST APIs consumed by external clients (mobile app in future).
- `'use client'` and `'use server'` directives follow Next.js 16 boundary rules. Never put business logic inside `'use client'` components.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     BROWSER / PWA                        │
│                                                          │
│  Next.js App Router (RSC + Client Components)           │
│  ┌──────────────┐   ┌──────────────────────────────┐   │
│  │  Server      │   │  Client Components           │   │
│  │  Components  │   │  + Dexie.js (IndexedDB)      │   │
│  │  (RSC)       │   │  + Sync Queue                │   │
│  └──────────────┘   └──────────────────────────────┘   │
│         │                        │                       │
│         │ Server Actions /       │ Dexie mutations       │
│         │ Route Handlers         │ queued for sync       │
└─────────┼────────────────────────┼───────────────────────┘
          │                        │
          ▼                        ▼ (when online)
┌─────────────────────────────────────────────────────────┐
│                  NEXT.JS SERVER (Node.js)                │
│                                                          │
│  Server Actions  │  Route Handlers  │  Middleware        │
│  (mutations)     │  (REST / webhook)│  (auth guard)      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │                  SERVICE LAYER                     │ │
│  │  createSale() │ returnSale() │ recordExpense()     │ │
│  │  adjustInventory() │ transferFunds() │ syncOps()   │ │
│  └────────────────────────────────────────────────────┘ │
│                          │                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │               PRISMA ORM (PostgreSQL)              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐   ┌──────────────────────────────┐
│    PostgreSQL        │   │  Firebase                    │
│  (transactional      │   │  - Authentication            │
│   source of truth)   │   │  - Cloud Messaging (FCM)     │
└─────────────────────┘   └──────────────────────────────┘
```

### Key architectural principles
1. **PostgreSQL is the source of truth.** Firebase is used only for auth and push notifications.
2. **Business logic lives in the service layer**, not in React components or Server Actions directly. Server Actions call service functions.
3. **Multi-tenancy is enforced at the service layer**, not only on the frontend.
4. **The offline database is a sync replica**, not a replacement for PostgreSQL. Mutations made offline are queued and eventually reconciled.
5. **Server Components render the majority of the UI.** Client Components are used only where interactivity requires them (POS cart, search, forms).

---

## 4. Domain Boundaries

The system has two completely separate financial domains that must never be mixed:

### Domain A: Merchant Finances
Everything related to the business owner's money, inventory, and operations.

| Domain | Entities |
|---|---|
| Identity | `User` |
| Tenancy | `Business`, `Branch` |
| Products | `Product`, `Category`, `Brand` |
| Inventory | `InventoryMovement`, `StockSnapshot` |
| Sales | `Sale`, `SaleItem`, `SaleReturn`, `SaleReturnItem` |
| Financial | `FinancialAccount`, `FinancialTransaction` |
| Payments | `Payment` |
| Expenses | `Expense`, `ExpenseCategory` |
| Reports | Derived from transactional tables |

### Domain B: SaaS Platform Billing
Everything related to the platform charging merchants for the service.

| Domain | Entities |
|---|---|
| Plans | `Plan`, `PlanFeature` |
| Subscriptions | `Subscription`, `SubscriptionItem` |
| Entitlements | `FeatureEntitlement`, `UsageLimit` |
| Billing | `Invoice`, `PlatformPayment` |
| Add-ons | `AddOn` |

These two domains must be in separate schema areas in Prisma and must never share service functions.

---

## 5. Multi-Tenancy Strategy

### Tenant hierarchy
```
User
  └── belongs to one or more Business (via BusinessMember)
        └── Business has one or more Branch
              └── Business data is always scoped to Business + optionally Branch
```

### Ownership model
Not every table gets a `businessId`. Ownership flows from the domain:

| Table | Owner | Scope rule |
|---|---|---|
| `Branch` | `Business` | `branch.businessId` |
| `Product` | `Business` | Products are business-wide; they can be sold at any branch |
| `InventoryMovement` | `Branch` | Stock is per-branch |
| `Sale` | `Branch` | Sales happen at a branch |
| `Expense` | `Branch` | Expenses happen at a branch |
| `FinancialAccount` | `Business` | Accounts are business-wide (e.g., one Telebirr account) |
| `FinancialTransaction` | `FinancialAccount` → `Business` | Scoped through account |

### Isolation enforcement
- The authenticated user's `businessId` and accessible `branchIds` are resolved server-side from their `BusinessMember` record — **never from the request body or query string**.
- Every service function takes a resolved `TenantContext` (containing `userId`, `businessId`, `branchId`, `role`) derived from the Firebase JWT and database lookup.
- Middleware runs on all `/app/*` routes to verify the Firebase token and attach the decoded UID to the request.
- Service functions must verify ownership before any read or write.

```typescript
// This shape is passed to every service function — never trust the client's claimed IDs
type TenantContext = {
  userId: string;       // Internal DB user ID — resolved from Firebase UID
  firebaseUid: string;
  businessId: string;
  branchId: string;
  role: UserRole;
};
```

---

## 6. Authentication Strategy

### Flow
```
1. User opens app
2. Firebase Authentication (email/password, phone OTP, Google — TBD)
3. Firebase issues JWT (ID token)
4. Client sends ID token with every request (Authorization: Bearer <token>)
5. Next.js middleware / Server Action verifies token with Firebase Admin SDK
6. Verified Firebase UID is looked up in PostgreSQL User table
7. User's role + business memberships are loaded
8. TenantContext is constructed
9. Service functions use TenantContext for all authorization decisions
```

### User record in PostgreSQL
Firebase proves identity. PostgreSQL holds application state:
- Internal `userId` (UUID)
- `firebaseUid` (Firebase UID string)
- `name`, `email`, `phone`
- `status` (ACTIVE, SUSPENDED, DELETED)
- Business memberships via `BusinessMember` join table (role, branch access)

### Session management
- Firebase handles token refresh automatically on the client.
- Server-side: Firebase Admin SDK verifies the token on each Server Action call. No server-side session store is required in the initial implementation.
- The verified `firebaseUid` is never stored in a cookie or localStorage in a way that can be tampered with.

---

## 7. Authorization Strategy

### Role model (initial)
```
OWNER    — Full access to their business
MANAGER  — Operational access (no subscription, no user management)
STAFF    — POS + permitted inventory operations only
```

### Authorization layer
Authorization is checked in two places:
1. **Next.js Middleware** — coarse-grained route access (authenticated vs. not)
2. **Service layer** — fine-grained operation authorization (`canRecordSale(context)`, `canViewFinancialReports(context)`)

The service layer is the authoritative gate. Middleware is a first line of defense only.

### Permission matrix (initial)

| Operation | OWNER | MANAGER | STAFF |
|---|---|---|---|
| Manage business settings | ✓ | — | — |
| Manage subscription | ✓ | — | — |
| Manage users / roles | ✓ | — | — |
| Manage branches | ✓ | — | — |
| Manage products | ✓ | ✓ | — |
| Manage inventory (adjustments) | ✓ | ✓ | limited |
| Record sales | ✓ | ✓ | ✓ |
| Apply price override | ✓ | ✓ | — |
| Apply discount | ✓ | ✓ | limited |
| Record expenses | ✓ | ✓ | — |
| View financial reports | ✓ | ✓ | — |
| Manage financial accounts | ✓ | — | — |
| Transfer funds between accounts | ✓ | ✓ | — |
| Process returns/refunds | ✓ | ✓ | — |

### Design for future granularity
The `BusinessMember` record can hold a `permissions: string[]` field that overrides defaults per-user. The authorization helpers check role defaults first, then per-user overrides. This is addable without breaking the initial role model.

---

## 8. Database Strategy

### Engine
PostgreSQL (hosted — Neon, Supabase PostgreSQL layer, or self-hosted). Connection via Prisma.

### Schema design principles
- Use UUIDs as primary keys for all business entities (offline-safe, no sequential ID leakage).
- Use `createdAt` / `updatedAt` timestamps on all entities.
- Use `deletedAt` (soft-delete) for all financially significant records. Hard deletes are forbidden for: `Sale`, `SaleItem`, `SaleReturn`, `Expense`, `FinancialTransaction`, `InventoryMovement`, `Payment`.
- Use `status` enums over boolean flags where state machines apply.
- Use PostgreSQL constraints (NOT NULL, CHECK, UNIQUE) as a second line of defense.
- Avoid storing derived/calculated values as authoritative. Exception: `StockSnapshot` as a performance cache only — always reconstructible from `InventoryMovement`.

### Monetary amount storage convention
All monetary amounts are stored as **integers in the smallest currency unit**. For ETB, 1 ETB = 100 stored units (santim). This eliminates all floating-point risk in financial calculations.

**Canonical rule:** No code outside of `src/shared/money.ts` may perform major-unit ↔ smallest-unit conversion or monetary formatting. Every formatting call routes through the Money utility.

```typescript
// Example — what this means in practice
// Database stores: 10050
// Display shows:   100.50 ETB
// Never do:        price / 100 inline in a component
// Always do:       Money.format(price, currency)
```

### Index strategy
Every frequently-queried column must be indexed:
- `businessId` on all tenant-scoped tables
- `branchId` on branch-scoped tables
- `sku`, `barcode` on `Product`
- `createdAt` on `Sale`, `Expense`, `InventoryMovement`
- `syncOperationId` on `SyncOperation`
- `firebaseUid` on `User`
- Composite indexes: `(businessId, createdAt)`, `(branchId, createdAt)`

### Domain model sketch (top-level entities)

```
Identity / Tenancy
  User
  Business
  Branch
  BusinessMember           (User ↔ Business ↔ Role ↔ Branches)

Products
  Category
  Product                  (belongs to Business, not Branch)
  Brand                    (optional)

Inventory
  InventoryMovement        (belongs to Branch + Product)
  StockSnapshot            (cache — belongs to Branch + Product)

Sales
  Sale                     (belongs to Branch, created by User)
  SaleItem                 (belongs to Sale; stores historical price + cost)
  Payment                  (belongs to Sale + FinancialAccount)
  SaleReturn               (references Sale)
  SaleReturnItem           (references SaleItem)

Expenses
  ExpenseCategory
  Expense                  (belongs to Branch + FinancialAccount)

Financial
  FinancialAccount         (belongs to Business; branchId nullable — null = business-wide)
  FinancialTransaction     (belongs to FinancialAccount; ledger entry)

Audit
  AuditLog                 (immutable event record)

Sync
  SyncOperation            (offline mutation queue entry)

SaaS Billing (separate)
  Plan
  PlanFeature
  Subscription
  FeatureEntitlement
  UsageLimit
  Invoice
  PlatformPayment
```

---

## 9. Inventory Strategy

### Core principle: inventory movements are the source of truth
The system maintains a ledger of stock movements. Current stock is derived by summing movements. A `StockSnapshot` table caches the current quantity per product per branch for query performance — but it is always reconstructible and is never the authoritative record.

### Movement types
```typescript
enum InventoryMovementType {
  OPENING_STOCK    = 'OPENING_STOCK',
  PURCHASE         = 'PURCHASE',
  SALE             = 'SALE',
  SALE_RETURN      = 'SALE_RETURN',
  DAMAGE           = 'DAMAGE',
  MANUAL_ADJUST    = 'MANUAL_ADJUST',
  TRANSFER_IN      = 'TRANSFER_IN',   // future: inter-branch transfers
  TRANSFER_OUT     = 'TRANSFER_OUT',
}
```

### Calculating current stock
```sql
SELECT SUM(quantity) FROM inventory_movement
WHERE product_id = $1 AND branch_id = $2 AND deleted_at IS NULL;
```
Positive movements: `OPENING_STOCK`, `PURCHASE`, `SALE_RETURN`, `TRANSFER_IN`, `MANUAL_ADJUST` (positive)  
Negative movements: `SALE`, `DAMAGE`, `TRANSFER_OUT`, `MANUAL_ADJUST` (negative)

### Sale → inventory atomicity
When a sale is completed, the service creates these records in a single Prisma transaction:
1. `Sale` record
2. `SaleItem` records (with snapshotted price + cost)
3. `Payment` record(s)
4. `InventoryMovement` record(s) (type: `SALE`, negative quantity)
5. `FinancialTransaction` record(s) (account balance update)
6. `StockSnapshot` update (upsert — performance cache only)

If any step fails, the entire transaction rolls back. No partial sale state.

### Low-stock alerts
A product has a `minStockLevel` field. After each sale sync, a background check compares `StockSnapshot.quantity` against `minStockLevel`. Below threshold → FCM push notification to OWNER/MANAGER.

---

## 10. Sales Strategy

### POS design principles
- A sale must be completable in 3–10 seconds once the user is familiar.
- The cart is a client-side state machine (no server roundtrip per item).
- "New Sale" is the highest-priority action in the UI.
- Customer information is optional — anonymous sales are the norm.
- Products can be found by: name search, tap from a list, or barcode scan.

### Sale data immutability
Sale items snapshot the selling price and cost at the time of the sale. They are **not** foreign-keyed to the current product price. This ensures:
- Historical reports remain accurate regardless of future price changes.
- Returns calculate correctly even if the product price has since changed.

### Sale state machine
```
DRAFT → COMPLETED → (optionally) RETURNED / PARTIALLY_RETURNED
```
A `DRAFT` sale is a cart — it exists only in local state, never committed to PostgreSQL until "Complete Sale" is confirmed.

### Payment accounts
Payment methods are not strings — they are references to `FinancialAccount` records. A sale can have multiple payment records against different accounts (mixed payment). Each payment creates a corresponding `FinancialTransaction` debit/credit.

### Price overrides and discounts
- `SaleItem.unitPrice` stores the actual price charged (may differ from `Product.sellingPrice`).
- `SaleItem.discountAmount` records any item-level discount.
- `Sale.discountAmount` records any sale-level discount.
- `Sale.originalTotal` and `Sale.finalTotal` preserve audit trail.
- Price overrides require `OWNER` or `MANAGER` role. The authorization check is in the service layer.

---

## 11. Financial Model

### Core accounting concepts (distinct — never mixed)

| Concept | Definition |
|---|---|
| Revenue | Sum of `SaleItem.unitPrice * SaleItem.quantity` for completed sales (net of returns) |
| COGS | Sum of `SaleItem.costPrice * SaleItem.quantity` for completed sales |
| Gross Profit | Revenue − COGS |
| Operating Expenses | Sum of all `Expense.amount` in period |
| Net Operating Profit | Gross Profit − Operating Expenses |
| Cash Balance | Current balance of the Cash `FinancialAccount` |
| Telebirr Balance | Current balance of the Telebirr `FinancialAccount` |
| Inventory Value | Sum of `(currentStock × Product.costPrice)` per product per branch |

**These are different numbers. Reports must never conflate them.**

### Financial account ownership (MVP)
Financial accounts are owned at the **business level** in the MVP, with a nullable `branchId` field that enables branch-specific accounts later without a schema migration.

**Interpretation:**
- `branchId = null` → business-wide account (shared across all branches) — used in the MVP
- `branchId = <id>` → branch-specific account (reserved for future use)

Default accounts created on business registration (all with `branchId = null`):
- Cash
- Telebirr
- Commercial Bank (optional)

The MVP creates business-wide accounts only. Branch-specific accounts require no schema change — only service-layer logic to scope queries by `branchId` when set.

### Financial accounts as a ledger
Every `FinancialAccount` maintains a balance through double-entry-adjacent `FinancialTransaction` records:

- Sale payment → debit account (balance increases)
- Expense payment → credit account (balance decreases)
- Transfer out → credit source account
- Transfer in → debit destination account
- Manual adjustment → debit or credit with reason

The account's running balance is the sum of all transactions. A `FinancialAccount.currentBalance` field is a cache — always reconstructible.

### Critical distinction: transfer vs. revenue
A transfer from Telebirr to a bank account is **not revenue**. It moves money between accounts. Revenue is only generated by completed sales. This must be explicitly modeled:

```typescript
enum FinancialTransactionType {
  SALE_PAYMENT     = 'SALE_PAYMENT',    // inflow — from sale
  EXPENSE_PAYMENT  = 'EXPENSE_PAYMENT', // outflow — for expense
  TRANSFER_IN      = 'TRANSFER_IN',     // account-to-account
  TRANSFER_OUT     = 'TRANSFER_OUT',
  MANUAL_CREDIT    = 'MANUAL_CREDIT',   // opening balance, adjustment
  MANUAL_DEBIT     = 'MANUAL_DEBIT',
  REFUND           = 'REFUND',          // outflow — for sale return
}
```

---

## 12. Offline-First Strategy

### Design principle
The application must remain fully operational for daily shop tasks when there is no internet. This is non-negotiable for the Ethiopian market where connectivity is unreliable.

### Architecture: Dexie.js + IndexedDB + explicit sync queue

The offline-first architecture is built entirely on:
- **Dexie.js** — typed wrapper around browser IndexedDB
- **IndexedDB** — local persistent storage in the browser
- **Explicit mutation queue** — every offline write is recorded as a `SyncOperation`
- **Sync protocol** — a background processor submits queued operations to the server when connectivity returns
- **Next.js server / Route Handler** — receives and processes sync batches
- **PostgreSQL** — the authoritative source of truth

This is a deliberate, self-contained offline architecture that does not depend on any experimental Next.js framework features. Next.js experimental offline features (e.g. `experimental.useOffline`) are **not used** — they address a different problem (retrying failed navigations) and are not appropriate as a foundation for business-data synchronization.

```
User action (e.g., record sale)
        │
        ▼
Dexie mutation (local, immediate)
  "Sale completed" shown to user
        │
        ├─── If ONLINE: SyncQueue processor picks up immediately
        │              → POST /api/sync/batch
        │              → Service layer validates + writes to PostgreSQL
        │              → SyncOperation marked ACKNOWLEDGED
        │
        └─── If OFFLINE: SyncOperation stays PENDING in IndexedDB
                              │
                              ▼ (connectivity restored)
                        Background processor detects online event
                              │
                              ▼
                        POST /api/sync/batch → PostgreSQL
                              │
                              ▼
                        SyncOperation marked ACKNOWLEDGED
```

### Connectivity detection
Connectivity is detected using the browser's standard `online` / `offline` events plus a lightweight HTTP probe (a `HEAD` request to the app's own origin). This is more reliable than `navigator.onLine` alone, which can report `true` when the device has a network interface but no actual internet route.

The `useOffline` hook in `src/client/hooks/use-offline-status.ts` (Phase 9) will implement this logic directly — it does not depend on `next/offline`.

### Local Dexie schema mirrors the core server entities
The local Dexie database maintains a working set of:
- Products (replicated from server, refreshed on sync)
- InventoryMovements (pending + confirmed)
- Sales (local drafts + completed pending sync)
- Expenses (pending sync)
- Financial account balances (approximate — exact balance from server on sync)
- SyncQueue (mutation log)

### What is and is not available offline

| Operation | Offline available |
|---|---|
| Browse / search products | ✓ (from local replica) |
| Barcode scan | ✓ |
| Create sale | ✓ (queued for sync) |
| Record expense | ✓ (queued for sync) |
| View today's local sales | ✓ |
| View local inventory quantities | ✓ (approximate) |
| View accurate reports | ✗ (requires server) |
| User management | ✗ |
| Business settings | ✗ |
| Subscription management | ✗ |

---

## 13. Synchronization Strategy

### Fundamental rules
1. **Client-generated UUIDs** for all offline-created records. The server must accept the client's UUID as the primary key, or map it deterministically.
2. **Idempotency is mandatory.** Every sync operation has a `syncOperationId` (UUID generated on the client). If the same operation reaches the server twice, the second call is a no-op.
3. **Operations are append-only.** The sync queue records mutations as events, not as state snapshots. "Replace local data with server data" is never used.
4. **Acknowledgement tracking.** Each `SyncOperation` transitions through states: `PENDING → SUBMITTED → ACKNOWLEDGED / FAILED`.

### SyncOperation schema
```typescript
type SyncOperation = {
  syncOperationId: string;   // client-generated UUID
  clientId: string;          // device/browser fingerprint
  entityType: string;        // 'Sale', 'Expense', 'InventoryMovement', etc.
  entityId: string;          // client-generated UUID of the record
  operationType: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: unknown;          // the data to apply
  createdAt: string;         // ISO timestamp (client clock)
  status: SyncStatus;
  retryCount: number;
  lastError: string | null;
  serverAcknowledgedAt: string | null;
};
```

### Sync flow
```
1. Background SyncProcessor polls queue every 30 seconds (when online)
2. Takes PENDING operations in createdAt order
3. Submits to POST /api/sync/batch
4. Server validates each operation (auth, idempotency check, business rules)
5. Server responds with per-operation results
6. Client marks operations as ACKNOWLEDGED or FAILED
7. Client updates local Dexie records with server-confirmed IDs/state
8. Conflicts are flagged for user resolution (see Section 14)
```

### Idempotency mechanism
The server maintains a `processed_sync_operations` table (or a unique index on `syncOperationId`). Before processing any operation, the server checks: "have I already processed this `syncOperationId`?" If yes, return the original result. No duplicate record is created.

---

## 14. Conflict Resolution Strategy

### Why conflicts occur
Two devices may be offline simultaneously and create mutations that conflict when they later sync. Classic example: Device A and Device B both sell the last unit of a product before either syncs.

### Approach: explicit detection over silent resolution
This system **does not silently auto-merge** conflicting financial or inventory records. Correctness is more important than convenience.

### Inventory conflicts
Because inventory uses an append-only movement log, no true record conflict occurs at the database level — both sales will have their `InventoryMovement` records inserted. The conflict becomes visible as a negative stock quantity.

**Resolution rule (inventory):**
- Both sales are valid and complete.
- The stock simply goes negative, which is surfaced as a warning.
- The OWNER/MANAGER is notified and can reconcile (adjust inventory, issue a correction).
- The system never silently rejects a sale that was completed offline in good faith.

### Financial conflicts
Financial transactions are append-only. Two expenses or sales created on different devices do not conflict — they are both valid records. The balance will be accurate once both sync.

### Definitional conflicts (same entity edited on two devices)
For entities where the same record may be edited by two devices (e.g., product price), the system uses **last-writer-wins** with a server timestamp, but surfaces a notification to the OWNER that a concurrent edit occurred. Full conflict resolution UI is a post-MVP feature.

### Decisions still required
- What is the exact UX when a synced sale causes stock to go negative? (See Section 21.)
- How long should the sync queue retain FAILED operations before alerting the user?

---

## 15. SaaS Billing Architecture

### Strict separation from merchant finances
The platform's billing system is an entirely separate domain. Merchant Telebirr and bank balances have nothing to do with subscription payments.

### Plan model
Plans are configured in the database, not hard-coded:
```
Plan → PlanFeature[] (features included)
     → UsageLimit[]  (e.g., max products, max users, max transactions/month)
```

### Subscription lifecycle
```
Trial (14 days, full Business features)
  │
  ▼
Active Subscription (Starter / Business / Pro)
  │
  ├── Expired → Grace period (7 days, read-only mode)
  │
  └── Cancelled → Expired
```

### Entitlement enforcement
- A service-layer `checkEntitlement(context, feature)` function is called before any gated operation.
- Usage limits are checked via `checkUsageLimit(context, limitType)`.
- These checks consult the `Subscription → Plan → FeatureEntitlement` chain, not hard-coded plan names.
- Changing a plan's features or limits updates all subscribers automatically without code changes.

### Initial plan concepts

| Feature | STARTER | BUSINESS | PRO |
|---|---|---|---|
| Inventory | ✓ | ✓ | ✓ |
| Sales/POS | ✓ | ✓ | ✓ |
| Expenses | ✓ | ✓ | ✓ |
| Financial accounts | ✓ | ✓ | ✓ |
| Basic reports | ✓ | ✓ | ✓ |
| Offline | ✓ | ✓ | ✓ |
| Users | 1 | up to 5 | unlimited |
| Branches | 1 | 1 | multiple |
| Products | up to 200 | up to 2000 | unlimited |
| Advanced reports | — | ✓ | ✓ |
| Advanced P&L / tax tools | — | — | ✓ |

### Platform payment tracking
`PlatformPayment` records track subscription payments. These are entirely separate from `FinancialTransaction` records in the merchant domain. The integration method (Chapa, manual, bank transfer) is a future decision.

---

## 16. Security Principles

### Trust model
- **Never trust the client** for businessId, branchId, userId, role, or permission values.
- All authorization is resolved server-side from the Firebase UID → PostgreSQL lookup chain.
- The client sends a Firebase ID token. The server resolves all context from that.

### Threat mitigations

| Threat | Mitigation |
|---|---|
| Cross-tenant access | TenantContext resolved server-side; every query filters by resolved businessId |
| IDOR | Resource IDs (UUIDs) are validated against the tenant context before any operation |
| Role escalation | Role changes require OWNER role; role is never read from the request body |
| Duplicate transactions | `syncOperationId` unique index prevents replay attacks |
| Replayed sync | Idempotency check on `syncOperationId` before processing |
| Unauthorized price override | Service layer checks role before accepting `unitPrice != product.sellingPrice` |
| Secret exposure | Firebase Admin credentials server-side only (never in `NEXT_PUBLIC_*`) |
| SQL injection | Prisma parameterized queries |
| XSS | React's default escaping; no `dangerouslySetInnerHTML` without review |
| Insecure direct object references | All lookups verify `businessId` ownership before returning |

### Input validation
- All Server Action inputs validated with Zod schemas before reaching the service layer.
- All Route Handler inputs validated with Zod schemas.
- Database constraints as second line of defense.

### Secret management
- Firebase Admin SDK credentials → server-side environment variables only
- Database connection string → server-side environment variables only
- `NEXT_PUBLIC_*` variables → only non-sensitive configuration (Firebase client config)

---

## 17. Testing Strategy

### Priority order
1. Authorization / tenant isolation tests
2. Service-layer business logic (sale totals, inventory calculations, profit calculations)
3. Sync idempotency
4. API / Server Action input validation
5. Subscription entitlement enforcement
6. E2E critical paths (sale flow, expense recording, report viewing)

### Test types

| Type | Tool | Scope |
|---|---|---|
| Unit | Vitest | Service functions, domain calculations, Zod schemas |
| Integration | Vitest + test DB | Service functions against a real PostgreSQL test database |
| E2E | Playwright | Critical user flows (sale, expense, login, sync) |

### Coverage targets (post-MVP)
- Service layer: > 80% line coverage
- Authorization: 100% of permission boundaries tested
- Sync: all operation types tested for idempotency

### What not to test
- UI styling
- Third-party library internals (Firebase, Prisma)
- Generated Prisma client code

---

## 18. Proposed Project Structure

```
business-management-saas/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Route group: unauthenticated pages
│   │   ├── login/
│   │   ├── signup/
│   │   └── onboarding/           # Business creation flow
│   ├── (dashboard)/              # Route group: authenticated app
│   │   ├── layout.tsx            # Auth guard + nav shell
│   │   ├── page.tsx              # Dashboard / home
│   │   ├── sell/                 # POS / Sales screen
│   │   ├── inventory/
│   │   ├── products/
│   │   ├── expenses/
│   │   ├── reports/
│   │   ├── accounts/             # Financial accounts
│   │   └── settings/
│   │       ├── business/
│   │       ├── branches/
│   │       ├── users/
│   │       └── subscription/
│   ├── api/                      # Route Handlers (REST / webhooks)
│   │   ├── auth/                 # Firebase webhook, token verification util
│   │   └── sync/                 # Offline sync endpoint
│   ├── manifest.ts               # PWA manifest
│   ├── layout.tsx                # Root layout
│   ├── globals.css
│   └── favicon.ico
│
├── src/                          # All non-routing source code
│   ├── server/                   # Server-only code (never imported by client)
│   │   ├── auth/
│   │   │   ├── firebase-admin.ts # Firebase Admin SDK init
│   │   │   ├── verify-token.ts   # ID token → firebaseUid
│   │   │   └── resolve-context.ts # firebaseUid → TenantContext
│   │   ├── db/
│   │   │   └── prisma.ts         # Prisma client singleton
│   │   └── services/             # Domain service functions
│   │       ├── sale.service.ts
│   │       ├── inventory.service.ts
│   │       ├── expense.service.ts
│   │       ├── financial.service.ts
│   │       ├── product.service.ts
│   │       ├── user.service.ts
│   │       ├── business.service.ts
│   │       ├── sync.service.ts
│   │       └── subscription.service.ts
│   │
│   ├── shared/                   # Code safe to use on both server and client
│   │   ├── types/                # Domain types and interfaces
│   │   │   ├── tenant.types.ts
│   │   │   ├── sale.types.ts
│   │   │   ├── inventory.types.ts
│   │   │   ├── financial.types.ts
│   │   │   └── ...
│   │   ├── validation/           # Zod schemas (shared client + server)
│   │   │   ├── sale.schema.ts
│   │   │   ├── expense.schema.ts
│   │   │   └── ...
│   │   └── errors/               # Application error types
│   │       └── app-error.ts
│   │
│   ├── client/                   # Client-only code
│   │   ├── db/
│   │   │   ├── dexie.ts          # Dexie instance + schema
│   │   │   └── sync-queue.ts     # SyncQueue operations
│   │   ├── hooks/
│   │   │   ├── use-tenant.ts
│   │   │   ├── use-sale-cart.ts
│   │   │   └── ...
│   │   └── firebase/
│   │       └── firebase-client.ts # Firebase client SDK init
│   │
│   └── components/               # Shared UI components
│       ├── ui/                   # Primitive components (button, input, table…)
│       ├── layout/               # Nav, sidebar, mobile bottom nav
│       ├── offline/              # OfflineBanner, connectivity status
│       └── forms/                # Shared form building blocks
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── public/
│   ├── icons/                    # PWA icons
│   └── sw.js                     # Service worker (Serwist output)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── ARCHITECTURE.md               # This document
├── IMPLEMENTATION_PLAN.md
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

### Rationale for `src/` split
- `src/server/` — server-only. Importing anything from here in a `'use client'` file will cause a build error, which is the intended behaviour. Firebase Admin, Prisma, and all service functions live here.
- `src/shared/` — types, Zod schemas, error classes. Safe to import from both server components and client components.
- `src/client/` — Dexie, Firebase client SDK, client hooks. Safe to import only in `'use client'` files.
- `src/components/` — UI components. May be server or client; individual files declare their boundary.

### Note on `app/` vs `src/`
Next.js 16 supports both `app/` at the root and `src/app/`. This project keeps `app/` at the root (matching the existing scaffold) and places all non-routing source code under `src/`. This avoids moving the existing files and keeps the routing structure clean.

---

## 19. Development Phases

### Phase 0 — Repository audit and architecture ✓ (this document)
- Inspect existing scaffold
- Document architecture decisions
- Create implementation plan
- No code changes to application logic

### Phase 1 — Foundation
- Project structure setup (create `src/` directories)
- Install missing packages (Prisma, Zod, Firebase Admin, Dexie.js)
- `.env.example` with required variables
- Error handling foundation (`AppError`, error types enum)
- Update `next.config.ts` (add `useOffline: true`)
- ESLint custom rules (no `any`, import boundaries)
- PWA manifest stub

### Phase 2 — Database
- PostgreSQL connection
- Prisma schema (all core entities)
- Initial migration
- Seed script for development

### Phase 3 — Identity and tenancy
- Firebase Admin SDK setup
- Token verification middleware
- `TenantContext` resolution
- User, Business, Branch, BusinessMember models
- Onboarding flow (signup → create business → create branch)
- Role-based authorization helpers

### Phase 4 — Products and inventory
- Product CRUD (server + UI)
- Category management
- `InventoryMovement` model and service
- Stock calculation queries
- `StockSnapshot` cache management
- Basic inventory UI

### Phase 5 — Sales / POS
- Sale cart (client-side state)
- Product search (fast, 3-field: name / SKU / barcode)
- Complete sale (server-side transaction)
- Payment recording
- Inventory reduction on sale
- Sale history
- POS UI (optimized for speed)

### Phase 6 — Expenses and financial accounts
- Financial account CRUD
- Expense recording
- Account balance queries
- Fund transfer between accounts
- Financial account UI

### Phase 7 — Reports
- Dashboard: today's revenue, sales count, gross profit, expenses, net profit
- Account balances on dashboard
- Sales report with date filters
- Expense report
- Profit report (revenue, COGS, gross, expenses, net)
- Inventory value report
- Low-stock report

### Phase 8 — Returns
- Sale return flow
- Partial return support
- Inventory restoration
- Financial adjustment
- Return UI

### Phase 9 — Offline (Dexie + sync)
- Dexie schema and local DB setup
- Local-first sale creation
- Local-first expense recording
- SyncQueue processor
- Server-side sync endpoint with idempotency
- Offline UI indicators
- Conflict surfacing (negative stock warning)

### Phase 10 — PWA / mobile
- PWA manifest with icons
- Serwist service worker (offline shell caching)
- Mobile-optimized layouts (bottom nav, touch targets)
- Mobile POS workflow
- Push notification integration (FCM) — low-stock alerts

### Phase 11 — SaaS billing
- Plan and feature configuration in DB
- Trial subscription on business creation
- Entitlement check middleware
- Usage limit enforcement
- Subscription management UI
- Invoice stub (billing integration TBD)

### Phase 12 — Testing and hardening
- Service layer unit tests
- Authorization integration tests
- Sync idempotency tests
- E2E: sale flow, expense recording, reports
- Security review
- Performance audit
- Production checklist

---

## 20. Important Architectural Decisions

### ADR-001: PostgreSQL is the source of truth, not Dexie
**Decision:** Dexie/IndexedDB is a local sync replica. All operations that happen offline are queued and replayed against PostgreSQL. The server state is authoritative.  
**Rationale:** Prevents permanent data divergence. Audit trails, reports, and financial calculations must be based on a single consistent ledger.

### ADR-002: Inventory uses movement ledger, not mutable stock field
**Decision:** `InventoryMovement` records are the source of truth for stock. `StockSnapshot` is a derived cache only.  
**Rationale:** Auditable inventory history, correct returns, accurate historical reports, offline conflict detection.

### ADR-003: Sale items snapshot price and cost at time of sale
**Decision:** `SaleItem.unitPrice` and `SaleItem.costPrice` are stored at the time of sale, not derived from the current `Product` price.  
**Rationale:** Historical reports must remain accurate. Product price changes must not alter past financial records.

### ADR-004: Financial accounts are entities, not string payment methods
**Decision:** `FinancialAccount` is a proper entity. Payments reference a `FinancialAccount` record.  
**Rationale:** Enables accurate account balances, fund transfers, and the critical distinction between revenue and transfers.

### ADR-005: Firebase for identity, PostgreSQL for authorization
**Decision:** Firebase proves who the user is. PostgreSQL determines what they can do.  
**Rationale:** Keeps auth infrastructure separate from business rules. Business rules can evolve without changing the auth provider.

### ADR-006: TenantContext is always resolved server-side
**Decision:** `businessId`, `branchId`, and `role` are never accepted from the client. They are always resolved from the Firebase UID via a PostgreSQL lookup.  
**Rationale:** IDOR and cross-tenant access prevention.

### ADR-007: SaaS billing is a completely separate domain
**Decision:** No code path mixes `FinancialTransaction` (merchant) with `PlatformPayment` (SaaS billing).  
**Rationale:** Conceptual clarity, prevents accounting errors, enables separate billing integrations.

### ADR-008: Sync operations are idempotent by syncOperationId
**Decision:** Each offline mutation carries a client-generated UUID (`syncOperationId`). The server rejects duplicates after processing the first instance.  
**Rationale:** Network retries and resubmissions must not create duplicate sales, expenses, or inventory movements.

### ADR-009: Keep `app/` at root, business code under `src/`
**Decision:** Do not move `app/` to `src/app/`. Keep routing at root. All non-routing source under `src/`.  
**Rationale:** Avoids disrupting the existing scaffold. Maintains a clear boundary between routing and business logic.

### ADR-010: Use Next.js Server Actions as the primary mutation API
**Decision:** Server Actions are the primary way client code triggers server mutations. Dedicated REST Route Handlers are reserved for: sync batch endpoint, webhook receivers, and any future mobile client API.  
**Rationale:** Server Actions in Next.js 16 are stable, type-safe, and integrate with the cache invalidation system. They reduce boilerplate.

---

## 21. Known Risks and Unresolved Decisions

### Resolved decisions

**UD-002: Firebase Authentication methods — RESOLVED 2026-10-08**  
Support email/password and Google OAuth in the initial MVP. Phone OTP is explicitly deferred.  
The authentication module must be structured so phone authentication can be added later (e.g., as a new `AuthProvider` strategy) without rewriting the identity layer.  
**→ Decision: Email/password + Google OAuth. Phone OTP deferred.**

**UD-004: Branch-level vs. business-level financial accounts — RESOLVED 2026-10-08**  
Financial accounts (Cash, Telebirr, Commercial Bank, etc.) are owned at the **business level** in the MVP. All branches share the same set of financial accounts.  
The schema must allow branch-specific accounts to be introduced later without a breaking migration (e.g., a nullable `branchId` on `FinancialAccount` that defaults to null meaning "business-wide").  
**→ Decision: Per-business accounts in MVP. Extensible for per-branch later.**

**UD-005: Money storage format — RESOLVED 2026-10-08**  
All monetary amounts are stored as **integers representing the smallest currency unit** (e.g., 100.50 ETB = `10050` stored). Floating-point arithmetic is forbidden for any monetary calculation.  
A `Money` utility module (`src/shared/money.ts`) provides the canonical conversion and formatting functions used everywhere in the codebase. No code may convert between units outside of that module.  
**→ Decision: Integer storage in smallest unit. Money utility module required.**

**UD-006: Tax in the MVP — RESOLVED 2026-10-08**  
Include basic nullable tax infrastructure in the schema (`taxRate`, `taxAmount` columns on `SaleItem` and `Expense`). Both columns default to null and are not populated by any MVP logic.  
Do NOT implement Ethiopian tax rules, compliance logic, or tax reports. Tax logic will be designed and validated in a future phase.  
**→ Decision: Nullable schema columns only. No tax logic in MVP.**

### Unresolved decisions still pending

**UD-001: What happens when a synced sale causes inventory to go negative?**  
Options:
- A) Surface a warning to the owner, accept the sale, leave stock negative.
- B) Reject the sale during sync and require manual resolution.
- C) Accept the sale but flag it as "stock discrepancy" requiring owner review.  
Recommendation: Option A or C — never silently reject a completed sale, but surface the discrepancy clearly.  
**→ Awaiting decision. Required before Phase 9.**

**UD-003: Subscription payment integration**  
How will merchants pay for their subscription? Options: Chapa (Ethiopian payment gateway), Telebirr direct integration, manual bank transfer + admin confirmation, international card (Stripe).  
**→ Awaiting decision. Required before Phase 11.**

**UD-007: Barcode scanning implementation**  
Web barcode scanning options: device camera + JavaScript barcode library (e.g., ZXing-js), or USB barcode scanner (keyboard wedge, works natively as text input). Both can be supported, but the primary expected hardware should be confirmed.  
**→ Awaiting decision. Required before Phase 4.**

### Known technical risks

**TR-001: Offline sync clock skew**  
Client-generated timestamps may be inaccurate (device clock wrong). The server should use server-side timestamps as authoritative for sorting and ordering. Client timestamps should be stored separately as `clientCreatedAt` for reference.

**TR-002: IndexedDB storage limits on mobile browsers**  
iOS Safari imposes storage limits on IndexedDB. Large product catalogs or long periods offline may hit limits. Mitigation: implement pruning of acknowledged sync operations and old local sale records.

**TR-003: Next.js 16 is a recent major version**  
Next.js 16.4.0 with `cacheComponents` and `partialPrefetching` are new stable APIs. Some ecosystem libraries (auth helpers, testing utilities) may not have updated to fully support these patterns. Verify library compatibility before installing.

**TR-004: Firebase Admin SDK on Edge Runtime**  
Firebase Admin SDK does not run on the Edge runtime. `next.config.ts` must ensure all routes using Firebase Admin are on the Node.js runtime. The existing config does not set `runtime = 'edge'` anywhere, which is correct.

**TR-005: Prisma v6 + connection pooling on serverless**  
If the application is deployed to a serverless environment (Vercel), Prisma v6 connections need connection pooling (via Prisma Accelerate or PgBouncer) to prevent connection exhaustion. This must be addressed before production deployment. Note: do not upgrade to Prisma v7/v8 to solve this — the pooling requirement exists in all versions; Prisma Accelerate or an external PgBouncer is the correct solution.
