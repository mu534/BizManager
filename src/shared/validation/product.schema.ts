/**
 * Zod validation schemas for product management.
 * Zod v4 API.
 *
 * Money fields (costPrice, sellingPrice) accept decimal strings like "100.50".
 * Conversion to integer storage units happens in product.service.ts via Money.fromMajorUnits().
 */
import { z } from "zod";

const moneyDecimalString = z
  .string()
  .min(1, "Price is required")
  .refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0,
    "Must be a valid non-negative number",
  );

export const createProductSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(200, "Product name is too long"),

  sku: z
    .string()
    .max(100, "SKU is too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  barcode: z
    .string()
    .max(100, "Barcode is too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  categoryId: z
    .string()
    .uuid("Invalid category")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  brand: z
    .string()
    .max(100, "Brand is too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  description: z
    .string()
    .max(1000, "Description is too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  unit: z
    .string()
    .min(1, "Unit is required")
    .max(50, "Unit is too long")
    .default("pcs"),

  /** Decimal string — e.g. "100.50". Converted to integer in the service. */
  costPrice: moneyDecimalString,

  /** Decimal string — e.g. "150.00". Converted to integer in the service. */
  sellingPrice: moneyDecimalString,

  minStockLevel: z
    .number()
    .int("Must be a whole number")
    .min(0, "Minimum stock cannot be negative")
    .default(0),

  status: z
    .enum(["ACTIVE", "ARCHIVED"], { error: "Invalid status" })
    .optional()
    .default("ACTIVE"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().omit({ status: true }).extend({
  status: z.enum(["ACTIVE", "ARCHIVED"], { error: "Invalid status" }).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productSearchSchema = z.object({
  query: z.string().optional(),
  categoryId: z.string().uuid().optional().transform((v) => (v === "" ? undefined : v)),
  status: z
    .enum(["ACTIVE", "ARCHIVED"], { error: "Invalid status" })
    .optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

export type ProductSearchInput = z.infer<typeof productSearchSchema>;
