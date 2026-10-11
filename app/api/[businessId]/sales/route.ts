import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { createSale } from "@server/services/sale.service";
import { createSaleSchema } from "@shared/validation/sale.schema";
import { isAppError } from "@shared/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const body: unknown = await request.json().catch(() => ({}));

    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid sale data", details: parsed.error.flatten().fieldErrors } },
        { status: 422 },
      );
    }

    const ctx = await resolveContext(businessId, parsed.data.branchId);
    const sale = await createSale(ctx, parsed.data);

    return NextResponse.json({ sale: { id: sale.id, receiptNumber: sale.receiptNumber, finalTotal: sale.finalTotal } });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    }
    console.error("[POST /api/[businessId]/sales]", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Sale failed." } }, { status: 500 });
  }
}
