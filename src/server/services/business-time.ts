/**
 * Business-level reporting context (currency + timezone offset) — SERVER ONLY.
 */
import "server-only";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { businessUtcOffsetMinutes } from "@shared/time";

export interface BusinessTime {
  currency: string;
  country: string;
  offsetMinutes: number;
}

export async function getBusinessTime(businessId: string): Promise<BusinessTime> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { currency: true, country: true },
  });
  if (!b) throw appError.notFound("Business not found.");
  return { ...b, offsetMinutes: businessUtcOffsetMinutes(b.country) };
}
