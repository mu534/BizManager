import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { recordExpense } from "@server/services/expense.service";
import { recordExpenseSchema } from "@shared/validation/expense.schema";
import { isAppError } from "@shared/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = recordExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid expense data", details: parsed.error.flatten().fieldErrors } },
        { status: 422 },
      );
    }
    const ctx = await resolveContext(businessId, parsed.data.branchId);
    const expense = await recordExpense(ctx, parsed.data);
    return NextResponse.json({ expenseId: expense.id });
  } catch (err) {
    if (isAppError(err)) return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Failed to record expense." } }, { status: 500 });
  }
}
