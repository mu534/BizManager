import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { submitSubscriptionPayment } from "@server/services/subscription-payment.service";
import { submitPaymentSchema } from "@shared/validation/subscription.schema";
import { MAX_EVIDENCE_BYTES } from "@shared/payment-evidence";
import { isAppError } from "@shared/errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  const { businessId } = await params;
  try {
    const ctx = await resolveContext(businessId);

    // Refuse oversized bodies before buffering them (small allowance for form fields).
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_EVIDENCE_BYTES + 64 * 1024) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "The receipt file is too large (maximum 4 MB)." } },
        { status: 413, headers: NO_STORE },
      );
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid form submission." } },
        { status: 400, headers: NO_STORE },
      );
    }

    const parsed = submitPaymentSchema.safeParse({
      planCode: form.get("planCode"),
      billingPeriod: form.get("billingPeriod"),
      method: form.get("method"),
      reference: form.get("reference"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please check the form.",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 422, headers: NO_STORE },
      );
    }

    const file = form.get("receipt");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Attach your receipt or screenshot." } },
        { status: 422, headers: NO_STORE },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const payment = await submitSubscriptionPayment(ctx, parsed.data, bytes);

    return NextResponse.json(
      { ok: true, paymentId: payment.id, status: payment.status },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode, headers: NO_STORE });
    }
    console.error("[POST /api/[businessId]/subscription/payments] Unexpected error:", err);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "An unexpected error occurred." } },
      { status: 500, headers: NO_STORE },
    );
  }
}
