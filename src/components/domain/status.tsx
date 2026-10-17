import { Badge, type Tone } from "@components/ui/primitives";

const SALE: Record<string, { label: string; tone: Tone }> = {
  COMPLETED: { label: "Completed", tone: "success" },
  PARTIALLY_RETURNED: { label: "Partly returned", tone: "warning" },
  RETURNED: { label: "Returned", tone: "neutral" },
  VOIDED: { label: "Voided", tone: "danger" },
};
export function SaleStatusBadge({ status }: { status: string }) {
  const s = SALE[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function StockBadge({ quantity, min }: { quantity: number; min: number }) {
  if (quantity <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (quantity <= min) return <Badge tone="warning">Low stock</Badge>;
  return <Badge tone="success">In stock</Badge>;
}
