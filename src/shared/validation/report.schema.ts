/**
 * Zod v4 schemas for report filters.
 */
import { z } from "zod";

export const reportFilterSchema = z.object({
  branchId: z.string().uuid().optional(),
  /** Preset range shortcut */
  range: z.enum(["today", "7days", "month", "custom"]).optional().default("today"),
  /** ISO date string YYYY-MM-DD — used when range = "custom" */
  from: z.string().optional(),
  to: z.string().optional(),
});

export type ReportFilterInput = z.infer<typeof reportFilterSchema>;

/**
 * Parse a filter input and return resolved UTC start/end Date objects.
 */
export function resolveReportDates(input: ReportFilterInput): {
  from: Date;
  to: Date;
} {
  const now = new Date();

  if (input.range === "custom" && input.from && input.to) {
    return {
      from: new Date(`${input.from}T00:00:00.000Z`),
      to: new Date(`${input.to}T23:59:59.999Z`),
    };
  }

  if (input.range === "7days") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 6);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  if (input.range === "month") {
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const to = new Date(now);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  // Default: today
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}
