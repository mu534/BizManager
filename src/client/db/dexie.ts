/**
 * BizManagerDB — Dexie/IndexedDB schema for offline-first operation.
 *
 * This is the client-side persistent store. PostgreSQL remains the
 * server-side source of truth. All records here are replicas or
 * locally-queued operations awaiting synchronisation.
 *
 * Money values follow the same convention as the server: integers in
 * the smallest currency unit (e.g. ETB 99.50 → 9950).
 */
import Dexie, { type EntityTable } from "dexie";

// ─── Sync status ────────────────────────────────────────────────────────────

export type SyncStatus =
  | "pending"
  | "submitting"
  | "synced"
  | "conflict"
  | "failed";

// ─── Product replica ─────────────────────────────────────────────────────────

export interface LocalProduct {
  /** Server-side UUID */
  id: string;
  businessId: string;
  branchId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  /** Integer smallest currency unit */
  sellingPrice: number;
  /** Integer smallest currency unit */
  costPrice: number;
  unit: string;
  stockQuantity: number;
  status: string;
  /** Unix timestamp (ms) when this replica was last synced */
  syncedAt: number;
}

// ─── Local sale ──────────────────────────────────────────────────────────────

export interface LocalSaleItem {
  productId: string;
  productName: string;
  productSku: string | null;
  /** Integer smallest currency unit */
  unitPrice: number;
  /** Integer smallest currency unit */
  unitCost: number;
  quantity: number;
  /** Integer smallest currency unit */
  discountAmount: number;
}

export interface LocalSale {
  /** Client-generated UUID (local primary key) */
  id: string;
  businessId: string;
  branchId: string;
  items: LocalSaleItem[];
  /** Integer smallest currency unit */
  discountAmount: number;
  /** Integer smallest currency unit */
  finalTotal: number;
  accountId: string;
  notes: string | null;
  receiptNumber: string | null;
  /**
   * Client-generated UUID preserved for idempotency.
   * NEVER regenerated on retry — same UUID for all delivery attempts.
   */
  syncOperationId: string;
  syncStatus: SyncStatus;
  /** Server-assigned sale ID once acknowledged */
  serverSaleId: string | null;
  /** Unix timestamp (ms) */
  createdAt: number;
  /** Unix timestamp (ms) */
  updatedAt: number;
}

// ─── Local expense ───────────────────────────────────────────────────────────

export interface LocalExpense {
  /** Client-generated UUID (local primary key) */
  id: string;
  businessId: string;
  branchId: string;
  categoryId: string;
  accountId: string;
  /** Integer smallest currency unit */
  amount: number;
  description: string | null;
  /** ISO date string YYYY-MM-DD */
  expenseDate: string;
  /**
   * Client-generated UUID preserved for idempotency.
   * NEVER regenerated on retry.
   */
  syncOperationId: string;
  syncStatus: SyncStatus;
  /** Server-assigned expense ID once acknowledged */
  serverExpenseId: string | null;
  /** Unix timestamp (ms) */
  createdAt: number;
}

// ─── Sync queue payloads ─────────────────────────────────────────────────────

export interface SyncSaleItem {
  productId: string;
  /** Decimal string — e.g. "150.00". Used by the sync endpoint. */
  unitPrice: string;
  quantity: number;
  /** Decimal string — e.g. "10.00". */
  discountAmount: string;
}

export interface SyncSalePayload {
  items: SyncSaleItem[];
  /** Decimal string — e.g. "50.00". */
  discountAmount: string;
  accountId: string;
  notes: string | null;
  /** branchId passed to the server for resolveContext verification. */
  branchId: string;
}

export interface SyncExpensePayload {
  categoryId: string;
  accountId: string;
  /**
   * Amount as decimal string (major units) — e.g. "150.00".
   * Stored as a string because the sync endpoint schema expects decimal strings.
   */
  amount: string;
  description: string | null;
  /** ISO date string YYYY-MM-DD */
  expenseDate: string;
  /** branchId passed to the server for resolveContext verification. */
  branchId: string;
}

// ─── Sync queue item ─────────────────────────────────────────────────────────

export interface SyncQueueItem {
  /** Client-generated UUID (local primary key) */
  id: string;
  /**
   * Idempotency key. Matches the syncOperationId stored in the
   * corresponding LocalSale / LocalExpense record.
   * MUST NOT be regenerated on retry.
   */
  syncOperationId: string;
  /** Device/installation identifier (localStorage 'bm_client_id') */
  clientId: string;
  businessId: string;
  entityType: "SALE" | "EXPENSE";
  /**
   * Local entity ID (LocalSale.id or LocalExpense.id).
   * Used to update the local record after the server responds.
   */
  entityId: string;
  operationType: "CREATE";
  payload: SyncSalePayload | SyncExpensePayload;
  schemaVersion: 1;
  status: SyncStatus;
  retryCount: number;
  /** Unix timestamp (ms) — do not process before this time */
  retryAt: number;
  lastError: string | null;
  /** Unix timestamp (ms) */
  createdAt: number;
}

// ─── Database class ──────────────────────────────────────────────────────────

export class BizManagerDB extends Dexie {
  localProducts!: EntityTable<LocalProduct, "id">;
  localSales!: EntityTable<LocalSale, "id">;
  localExpenses!: EntityTable<LocalExpense, "id">;
  syncQueue!: EntityTable<SyncQueueItem, "id">;

  constructor() {
    super("BizManagerDB");

    this.version(1).stores({
      // Product replicas — search by name offline
      localProducts: "[businessId+id], [businessId+sku], [businessId+barcode], businessId",

      // Locally-recorded sales
      localSales: "id, [businessId+branchId], [businessId+syncStatus], createdAt",

      // Locally-recorded expenses
      localExpenses: "id, [businessId+branchId], syncStatus, createdAt",

      // Durable operation queue
      syncQueue: "id, [businessId+status], retryAt, createdAt",
    });
  }
}

/** Singleton — import `db` everywhere in client code. */
export const db = new BizManagerDB();

// ─── Client ID helper ────────────────────────────────────────────────────────

/**
 * Returns the stable device/installation identifier stored in localStorage.
 * Generates and persists a new UUID on first call.
 */
export function getClientId(): string {
  const key = "bm_client_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}
