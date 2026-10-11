/**
 * Product service — SERVER ONLY.
 *
 * Handles product CRUD and search for a business tenant.
 * Every function verifies tenant isolation before accessing data.
 *
 * Money convention (UD-005):
 *   costPrice / sellingPrice inputs arrive as decimal strings.
 *   Money.fromMajorUnits() converts them to integer storage units.
 *   Never store or return raw floats for money fields.
 */
import "server-only";
import type { Product, StockSnapshot } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { Money } from "@shared/money";
import { requireOwnerOrManager } from "@server/auth/permissions";
import type { TenantContext } from "@shared/types/auth.types";
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductSearchInput,
} from "@shared/validation/product.schema";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProductWithStock extends Product {
  stockSnapshot: StockSnapshot | null;
}

export interface ProductListResult {
  products: ProductWithStock[];
  total: number;
  page: number;
  limit: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Load and validate the business currency.
 * Used when converting money input to integer storage units.
 */
async function getBusinessCurrency(businessId: string): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { currency: true },
  });
  if (!business) {
    throw appError.notFound("Business not found.");
  }
  return business.currency;
}

/**
 * Verify a product belongs to the context business.
 * Throws TENANT_VIOLATION if ownership does not match.
 */
async function requireProductOwnership(
  productId: string,
  businessId: string,
): Promise<Product> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) {
    throw appError.notFound("Product not found.");
  }
  if (product.businessId !== businessId) {
    throw appError.tenantViolation("Product does not belong to this business.");
  }
  return product;
}

// ─── Service functions ─────────────────────────────────────────────────────

/**
 * Create a new product for the authenticated business.
 * Requires OWNER or MANAGER role.
 * Validates uniqueness of SKU and barcode within the business.
 */
export async function createProduct(
  ctx: TenantContext,
  input: CreateProductInput,
): Promise<Product> {
  requireOwnerOrManager(ctx);

  const currency = await getBusinessCurrency(ctx.businessId);

  // Convert money inputs from decimal strings to integer storage units.
  const costPrice = Money.fromMajorUnits(parseFloat(input.costPrice), currency);
  const sellingPrice = Money.fromMajorUnits(parseFloat(input.sellingPrice), currency);

  // Check for duplicate SKU within this business.
  if (input.sku) {
    const existing = await prisma.product.findUnique({
      where: { businessId_sku: { businessId: ctx.businessId, sku: input.sku } },
    });
    if (existing) {
      throw appError.conflict(`A product with SKU "${input.sku}" already exists.`);
    }
  }

  // Check for duplicate barcode within this business.
  if (input.barcode) {
    const existing = await prisma.product.findUnique({
      where: {
        businessId_barcode: {
          businessId: ctx.businessId,
          barcode: input.barcode,
        },
      },
    });
    if (existing) {
      throw appError.conflict(
        `A product with barcode "${input.barcode}" already exists.`,
      );
    }
  }

  // Verify category belongs to this business if provided.
  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category || category.businessId !== ctx.businessId) {
      throw appError.notFound("Category not found.");
    }
  }

  return prisma.product.create({
    data: {
      businessId: ctx.businessId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      sku: input.sku ?? null,
      barcode: input.barcode ?? null,
      brand: input.brand ?? null,
      description: input.description ?? null,
      unit: input.unit,
      costPrice,
      sellingPrice,
      minStockLevel: input.minStockLevel,
      status: input.status ?? "ACTIVE",
    },
  });
}

/**
 * Update an existing product.
 * Requires OWNER or MANAGER role.
 * Only validates uniqueness for fields that actually changed.
 */
export async function updateProduct(
  ctx: TenantContext,
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  requireOwnerOrManager(ctx);

  const product = await requireProductOwnership(productId, ctx.businessId);
  const currency = await getBusinessCurrency(ctx.businessId);

  // Check SKU uniqueness only if it's being changed.
  if (input.sku !== undefined && input.sku !== product.sku) {
    if (input.sku) {
      const existing = await prisma.product.findUnique({
        where: {
          businessId_sku: { businessId: ctx.businessId, sku: input.sku },
        },
      });
      if (existing && existing.id !== productId) {
        throw appError.conflict(`A product with SKU "${input.sku}" already exists.`);
      }
    }
  }

  // Check barcode uniqueness only if it's being changed.
  if (input.barcode !== undefined && input.barcode !== product.barcode) {
    if (input.barcode) {
      const existing = await prisma.product.findUnique({
        where: {
          businessId_barcode: {
            businessId: ctx.businessId,
            barcode: input.barcode,
          },
        },
      });
      if (existing && existing.id !== productId) {
        throw appError.conflict(
          `A product with barcode "${input.barcode}" already exists.`,
        );
      }
    }
  }

  // Verify category ownership if changing.
  if (input.categoryId !== undefined && input.categoryId !== null) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category || category.businessId !== ctx.businessId) {
      throw appError.notFound("Category not found.");
    }
  }

  // Build update data — only convert money if the field is present.
  const updateData: Parameters<typeof prisma.product.update>[0]["data"] = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.sku !== undefined) updateData.sku = input.sku ?? null;
  if (input.barcode !== undefined) updateData.barcode = input.barcode ?? null;
  if (input.brand !== undefined) updateData.brand = input.brand ?? null;
  if (input.description !== undefined) updateData.description = input.description ?? null;
  if (input.unit !== undefined) updateData.unit = input.unit;
  if (input.minStockLevel !== undefined) updateData.minStockLevel = input.minStockLevel;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.categoryId !== undefined) updateData.categoryId = input.categoryId ?? null;

  if (input.costPrice !== undefined) {
    updateData.costPrice = Money.fromMajorUnits(parseFloat(input.costPrice), currency);
  }
  if (input.sellingPrice !== undefined) {
    updateData.sellingPrice = Money.fromMajorUnits(
      parseFloat(input.sellingPrice),
      currency,
    );
  }

  return prisma.product.update({
    where: { id: productId },
    data: updateData,
  });
}

/**
 * Archive a product.
 * Archived products remain in the database for historical record integrity.
 * Requires OWNER or MANAGER role.
 */
export async function archiveProduct(
  ctx: TenantContext,
  productId: string,
): Promise<Product> {
  requireOwnerOrManager(ctx);
  await requireProductOwnership(productId, ctx.businessId);

  return prisma.product.update({
    where: { id: productId },
    data: { status: "ARCHIVED" },
  });
}

/**
 * Load a single product by ID.
 * Enforces business ownership.
 */
export async function getProduct(
  ctx: TenantContext,
  productId: string,
): Promise<Product & { category: { id: string; name: string } | null }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: { select: { id: true, name: true } },
    },
  });
  if (!product) {
    throw appError.notFound("Product not found.");
  }
  if (product.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Product does not belong to this business.");
  }
  return product;
}

/**
 * List products for the business with optional filtering and pagination.
 * Includes the StockSnapshot for the context branch (if branchId set).
 */
export async function listProducts(
  ctx: TenantContext,
  filters: ProductSearchInput,
): Promise<ProductListResult> {
  const { query, categoryId, status, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where = {
    businessId: ctx.businessId,
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { sku: { contains: query, mode: "insensitive" as const } },
            { barcode: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rawProducts, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        ...(ctx.branchId ? { stockSnapshots: { where: { branchId: ctx.branchId } } } : {}),
        category: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  const products: ProductWithStock[] = rawProducts.map((p) => {
    const snapshots = ctx.branchId
      ? ((p as typeof p & { stockSnapshots: StockSnapshot[] }).stockSnapshots ?? [])
      : [];
    return {
      ...p,
      stockSnapshot: snapshots.length > 0 ? snapshots[0]! : null,
    };
  });

  return { products, total, page, limit };
}

/**
 * Search products by name, SKU, or barcode.
 * Used for POS autocomplete — returns up to 20 results.
 * Includes StockSnapshot for the context branch.
 */
export async function searchProducts(
  ctx: TenantContext,
  query: string,
): Promise<ProductWithStock[]> {
  const rawProducts = await prisma.product.findMany({
    where: {
      businessId: ctx.businessId,
      status: "ACTIVE",
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { barcode: { contains: query, mode: "insensitive" } },
      ],
    },
    include: {
      ...(ctx.branchId ? { stockSnapshots: { where: { branchId: ctx.branchId } } } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
  });

  return rawProducts.map((p) => {
    const snapshots = ctx.branchId
      ? ((p as typeof p & { stockSnapshots: StockSnapshot[] }).stockSnapshots ?? [])
      : [];
    return {
      ...p,
      stockSnapshot: snapshots.length > 0 ? snapshots[0]! : null,
    };
  });
}

/**
 * Find a product by barcode within the business.
 * Returns null if not found.
 */
export async function findByBarcode(
  ctx: TenantContext,
  barcode: string,
): Promise<ProductWithStock | null> {
  const product = await prisma.product.findUnique({
    where: {
      businessId_barcode: { businessId: ctx.businessId, barcode },
    },
    include: {
      ...(ctx.branchId ? { stockSnapshots: { where: { branchId: ctx.branchId } } } : {}),
    },
  });

  if (!product) return null;

  const snapshots = ctx.branchId
    ? ((product as typeof product & { stockSnapshots: StockSnapshot[] }).stockSnapshots ?? [])
    : [];

  return {
    ...product,
    stockSnapshot: snapshots.length > 0 ? snapshots[0]! : null,
  };
}

/**
 * Find a product by SKU within the business.
 * Returns null if not found.
 */
export async function findBySku(
  ctx: TenantContext,
  sku: string,
): Promise<Product | null> {
  return prisma.product.findUnique({
    where: {
      businessId_sku: { businessId: ctx.businessId, sku },
    },
  });
}
