import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@server/auth/session";
import { authorizeEvidenceAccess } from "@server/services/subscription-payment.service";
import { readEvidence } from "@server/storage/evidence-storage";
import { isAppError } from "@shared/errors";


export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
): Promise<NextResponse> {
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const { paymentId } = await params;
  if (!z.string().uuid().safeParse(paymentId).success) return notFound();

  const userId = await getSessionUserId();
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const access = await authorizeEvidenceAccess(userId, paymentId);
    if (!access.allowed) return notFound();

    const data = await readEvidence(access.payment.evidenceKey);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": access.payment.evidenceContentType,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="receipt-${paymentId}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[GET /api/payments/evidence] Unexpected error:", err);
    return new NextResponse("Server error", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
