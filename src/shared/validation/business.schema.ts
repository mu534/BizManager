/**
 * Zod validation schemas for business onboarding.
 * Zod v4 API.
 */
import { z } from "zod";

/**
 * Supported business type categories.
 * These are display labels; the database stores them as free-text strings.
 */
export const BUSINESS_TYPES = [
  "clothing",
  "shoes",
  "electronics",
  "grocery",
  "cosmetics",
  "general_retail",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const createBusinessSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name must be at least 2 characters")
    .max(120, "Business name is too long"),

  businessType: z.enum(BUSINESS_TYPES, {
    error: "Select a business type",
  }),

  country: z
    .string()
    .length(2, "Country must be a 2-letter ISO code")
    .toUpperCase(),

  currency: z
    .string()
    .min(3, "Currency is required")
    .max(3, "Currency must be a 3-letter ISO code")
    .toUpperCase(),

  phone: z
    .string()
    .max(30, "Phone number is too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  branchName: z
    .string()
    .min(1, "Branch name is required")
    .max(100, "Branch name is too long")
    .default("Main Branch"),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
