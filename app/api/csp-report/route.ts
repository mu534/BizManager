import { NextRequest, NextResponse } from "next/server";
import { summarizeCspReports } from "@shared/csp-report";

/**
 * Receives Content-Security-Policy violation reports from browsers. Public on purpose
 * (browsers send it without cookies), so it only logs a short, scrubbed summary and
 * limits how much it will read and log.
 */
const MAX_BYTES = 10_000;
const MAX_LOGS_PER_MINUTE = 60;
let windowStart = 0;
let logged = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const text = (await request.text().catch(() => "")).slice(0, MAX_BYTES);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  for (const v of summarizeCspReports(body)) {
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      logged = 0;
    }
    if (logged++ >= MAX_LOGS_PER_MINUTE) break;
    console.warn(`[csp] ${v.directive} blocked ${v.blocked} on ${v.page}`);
  }
  return new NextResponse(null, { status: 204 });
}