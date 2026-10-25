import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveContext } from "@server/auth/resolve-context";
import { getCurrentBranchId } from "@server/branch/current-branch";
import { prisma } from "@server/db/prisma";
import { getExpensesReport, getInventoryReport, getProfitReport, getSalesReport } from "@server/services/report.service";
import { expensesReportToCsv, inventoryReportToCsv, profitReportToCsv, salesReportToCsv } from "@server/services/report-csv";
import { FEATURE_KEYS, hasFeature, requireFeature } from "@server/services/subscription.service";
import { reportFilterSchema } from "@shared/validation/report.schema";
import { isAppError } from "@shared/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const kindSchema = z.enum(["sales", "profit", "expenses", "inventory"]);

/**
 * GET /api/[businessId]/reports/{sales|profit|expenses|inventory}/export
 *
 * Same authorization as the on-screen report (financial-report permission and
 * the report's own plan feature) PLUS the Pro export feature. The business comes
 * from the URL and is verified against the session's membership; the branch
 * filter is re-checked by the report service. Works in the read-only state so a
 * lapsed business can still take its data. (The product report has its own route.)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string; report: string }> },
): Promise<NextResponse> {
  const { businessId, report } = await params;
  const kind = kindSchema.safeParse(report);
  if (!kind.success) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown report." } }, { status: 404, headers: NO_STORE });

  try {
    const ctx = await resolveContext(businessId);
    const q = request.nextUrl.searchParams;
    const filters = reportFilterSchema.safeParse({
      range: q.get("range") ?? "month",
      from: q.get("from") ?? undefined,
      to: q.get("to") ?? undefined,
      branchId: q.get("branch") || undefined,
    });
    if (!filters.success) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid date range." } }, { status: 400, headers: NO_STORE });
    }

    await requireFeature(ctx, FEATURE_KEYS.REPORT_EXPORTS);
    const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
    const currency = biz?.currency ?? "ETB";

    let csv: string;
    let filename: string;
    switch (kind.data) {
      case "sales": {
        const r = await getSalesReport(ctx, filters.data);
        csv = salesReportToCsv(r, currency);
        filename = `sales-${r.period.fromKey}-to-${r.period.toKey}.csv`;
        break;
      }
      case "profit": {
        const r = await getProfitReport(ctx, filters.data);
        csv = profitReportToCsv(r, currency);
        filename = `profit-${r.period.fromKey}-to-${r.period.toKey}.csv`;
        break;
      }
      case "expenses": {
        const r = await getExpensesReport(ctx, filters.data);
        csv = expensesReportToCsv(r, currency);
        filename = `expenses-${r.period.fromKey}-to-${r.period.toKey}.csv`;
        break;
      }
      case "inventory": {
        const valuation = await hasFeature(businessId, FEATURE_KEYS.ADVANCED_REPORTS);
        const branchId = filters.data.branchId ?? (await getCurrentBranchId(ctx)) ?? undefined;
        if (!branchId) {
          return NextResponse.json({ error: { code: "NOT_FOUND", message: "No branch available." } }, { status: 404, headers: NO_STORE });
        }
        const r = await getInventoryReport(ctx, branchId, { includeValuation: valuation });
        csv = inventoryReportToCsv(r, currency, valuation);
        filename = "inventory.csv";
        break;
      }
    }

    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        ...NO_STORE,
      },
    });
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(err.toSafeJSON(), { status: err.statusCode, headers: NO_STORE });
    console.error("[GET /api/[businessId]/reports/[report]/export] Unexpected error:", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "An unexpected error occurred." } }, { status: 500, headers: NO_STORE });
  }
}
