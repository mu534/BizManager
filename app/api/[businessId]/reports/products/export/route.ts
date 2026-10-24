import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { getProductPerformanceReport, productReportToCsv } from "@server/services/product-report.service";
import { requireFeature, FEATURE_KEYS } from "@server/services/subscription.service";
import { prisma } from "@server/db/prisma";
import { reportFilterSchema } from "@shared/validation/report.schema";
import { isAppError } from "@shared/errors";
import type { SortKey } from "@shared/product-performance";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/[businessId]/reports/products/export?range=&from=&to=&sort=
 *
 * Same authorization as the on-screen report (financial-report permission +
 * Pro feature) PLUS the export feature. The business comes from the URL and is
 * verified against the session's membership. Works in the read-only state so a
 * lapsed business can still take its data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  const { businessId } = await params;
  try {
    const ctx = await resolveContext(businessId);
    const q = request.nextUrl.searchParams;

    const parsed = reportFilterSchema.safeParse({
      range: q.get("range") ?? "month",
      from: q.get("from") ?? undefined,
      to: q.get("to") ?? undefined,
      branchId: q.get("branch") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid date range." } }, { status: 400, headers: NO_STORE });
    }
    const sortParam = q.get("sort");
    const sort: SortKey = sortParam === "units" || sortParam === "revenue" ? sortParam : "profit";

    await requireFeature(ctx, FEATURE_KEYS.REPORT_EXPORTS);
    const report = await getProductPerformanceReport(ctx, parsed.data, sort);
    const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
    const csv = productReportToCsv(report, biz?.currency ?? "ETB");

    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-${report.period.fromKey}-to-${report.period.toKey}.csv"`,
        "X-Content-Type-Options": "nosniff",
        ...NO_STORE,
      },
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode, headers: NO_STORE });
    }
    console.error("[GET /api/[businessId]/reports/products/export] Unexpected error:", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "An unexpected error occurred." } }, { status: 500, headers: NO_STORE });
  }
}
