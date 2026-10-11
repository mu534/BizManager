/**
 * POST /api/business/create
 *
 * Creates a new business for the authenticated user.
 * The creation is transactional — business, branch, membership,
 * default accounts, and default expense categories are all created
 * atomically or not at all.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@server/auth/session";
import { getUserById } from "@server/services/user.service";
import {
  createBusiness,
  getBusinessesForUser,
} from "@server/services/business.service";
import {
  createBusinessSchema,
} from "@shared/validation/business.schema";
import { isAppError, appError } from "@shared/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Require an authenticated session.
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json(
        appError.unauthorized().toJSON(),
        { status: 401 },
      );
    }

    // 2. Load and validate the user.
    const user = await getUserById(userId);

    // 3. Validate the request body.
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createBusinessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        appError.validationError(
          "Invalid business data",
          parsed.error.flatten().fieldErrors,
        ).toJSON(),
        { status: 422 },
      );
    }

    // 4. Guard: prevent creating a second business via this endpoint.
    //    Multi-business support requires a different flow (Phase 11+).
    const existing = await getBusinessesForUser(user.id);
    if (existing.length > 0) {
      return NextResponse.json(
        appError.conflict(
          "You already have a business. Multi-business support is coming soon.",
        ).toJSON(),
        { status: 409 },
      );
    }

    // 5. Create business in a single transaction.
    const result = await createBusiness(user.id, parsed.data);

    return NextResponse.json({
      businessId: result.business.id,
      branchId: result.branch.id,
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    }
    console.error("[POST /api/business/create] Unexpected error:", err);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "An unexpected error occurred." } },
      { status: 500 },
    );
  }
}
