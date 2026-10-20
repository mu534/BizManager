

export interface WeightedAverageInput {
  /** Units currently on hand across the business (>= 0). */
  onHandQuantity: number;
  /** Current average unit cost, smallest currency unit (>= 0). */
  currentUnitCost: number;
  /** Units being received (> 0). */
  receivedQuantity: number;
  /** Unit cost of the received units, smallest currency unit (>= 0). */
  receivedUnitCost: number;
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer.`);
  }
}

/** Half-up integer division for non-negative BigInts. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const two = BigInt(2);
  return (numerator * two + denominator) / (denominator * two);
}

/** New average unit cost after receiving stock. */
export function computeWeightedAverageCost(input: WeightedAverageInput): number {
  assertNonNegativeInt(input.onHandQuantity, "On-hand quantity");
  assertNonNegativeInt(input.currentUnitCost, "Current unit cost");
  assertNonNegativeInt(input.receivedUnitCost, "Received unit cost");
  if (!Number.isSafeInteger(input.receivedQuantity) || input.receivedQuantity <= 0) {
    throw new RangeError("Received quantity must be a positive integer.");
  }

  if (input.onHandQuantity === 0) return input.receivedUnitCost;

  const existingValue = BigInt(input.onHandQuantity) * BigInt(input.currentUnitCost);
  const incomingValue = BigInt(input.receivedQuantity) * BigInt(input.receivedUnitCost);
  const totalQuantity = BigInt(input.onHandQuantity) + BigInt(input.receivedQuantity);

  return Number(divRoundHalfUp(existingValue + incomingValue, totalQuantity));
}

/** Inventory value = quantity x average unit cost (exact integer). */
export function inventoryValue(quantity: number, unitCost: number): number {
  assertNonNegativeInt(quantity, "Quantity");
  assertNonNegativeInt(unitCost, "Unit cost");
  return Number(BigInt(quantity) * BigInt(unitCost));
}
