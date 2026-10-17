/**
 * Sale line computation — pure, shared by the sale service and tests.
 *
 * Rules:
 *  - Staff always sell at the product's catalogue price (no price override).
 *  - OWNER/MANAGER may override the unit price, but never below zero.
 *  - Callers validate stock against totalQuantityByProduct(), not per line,
 *    so the same product appearing on two lines cannot bypass the stock check.
 *  - Discounts must be non-negative and cannot exceed what they discount.
 *  - All values are integers in the smallest currency unit.
 */
import { Money } from "./money";

export interface SaleLineInput {
  productId: string;
  /** Decimal string in major units (e.g. "25.50"). Ignored for STAFF. */
  unitPrice: string;
  quantity: number;
  /** Decimal string in major units. */
  discountAmount?: string;
}

export interface ProductPricing {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: number;
  costPrice: number;
}

export interface ComputedSaleLine {
  productId: string;
  productName: string;
  productSku: string | null;
  unitPrice: number;
  unitCost: number;
  quantity: number;
  discountAmount: number;
  lineTotal: number;
}

export interface ComputedSale {
  lines: ComputedSaleLine[];
  subtotal: number;
  saleDiscount: number;
  finalTotal: number;
}

export class SaleMathError extends Error {}

/** Strict decimal parser: rejects NaN, negatives, exponents and more than 2 decimals. */
export function parseMoneyStrict(
  value: string | undefined,
  currency: string,
  label: string,
): number {
  const raw = (value ?? "0").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new SaleMathError(`${label} is not a valid amount.`);
  }
  return Money.fromMajorUnits(Number(raw), currency);
}

export function computeSale(params: {
  items: readonly SaleLineInput[];
  saleDiscount: string | undefined;
  products: ReadonlyMap<string, ProductPricing>;
  /** OWNER/MANAGER only. When false the catalogue price is always used. */
  canOverridePrice: boolean;
  currency: string;
}): ComputedSale {
  const { items, products, canOverridePrice, currency } = params;
  if (items.length === 0) throw new SaleMathError("A sale needs at least one item.");

  const lines: ComputedSaleLine[] = [];
  let subtotal = 0;

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product) throw new SaleMathError(`Product ${item.productId} not found.`);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new SaleMathError(`Invalid quantity for "${product.name}".`);
    }

    const unitPrice = canOverridePrice
      ? parseMoneyStrict(item.unitPrice, currency, `Price for "${product.name}"`)
      : product.sellingPrice;

    const gross = Money.multiply(unitPrice, item.quantity);
    const discount = parseMoneyStrict(
      item.discountAmount,
      currency,
      `Discount for "${product.name}"`,
    );
    if (discount > gross) {
      throw new SaleMathError(`Discount exceeds line value for "${product.name}".`);
    }
    const lineTotal = Money.subtract(gross, discount);

    subtotal = Money.add(subtotal, lineTotal);
    lines.push({
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      unitPrice,
      unitCost: product.costPrice,
      quantity: item.quantity,
      discountAmount: discount,
      lineTotal,
    });
  }

  const saleDiscount = parseMoneyStrict(params.saleDiscount, currency, "Sale discount");
  if (saleDiscount > subtotal) {
    throw new SaleMathError("Sale discount cannot exceed the subtotal.");
  }

  return {
    lines,
    subtotal,
    saleDiscount,
    finalTotal: Money.subtract(subtotal, saleDiscount),
  };
}

/** Total quantity requested per product (after merging duplicate lines). */
export function totalQuantityByProduct(
  lines: readonly { productId: string; quantity: number }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const l of lines) {
    totals.set(l.productId, (totals.get(l.productId) ?? 0) + l.quantity);
  }
  return totals;
}
