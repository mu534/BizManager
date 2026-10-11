import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { searchProducts, findByBarcode } from "@server/services/product.service";
import { isAppError } from "@shared/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const branchId = request.nextUrl.searchParams.get("branchId") ?? undefined;

    const ctx = await resolveContext(businessId, branchId);

    // If query looks like a barcode (no spaces, short), try barcode first.
    if (q.length > 5 && !q.includes(" ")) {
      const byBarcode = await findByBarcode(ctx, q);
      if (byBarcode) {
        return NextResponse.json({ products: [byBarcode] });
      }
    }

    const products = await searchProducts(ctx, q);
    return NextResponse.json({ products });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    }
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Search failed." } }, { status: 500 });
  }
}
