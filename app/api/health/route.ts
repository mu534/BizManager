import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight connectivity probe used by the client-side useOfflineStatus
 * hook. No authentication required. Returns 200 OK with { ok: true }.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
