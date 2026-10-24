import { z } from "zod";

const name = z.string().trim().min(2, "Enter a branch name (at least 2 characters).").max(80, "Name is too long.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createBranchSchema = z.object({
  name,
  address: optionalText(200),
  phone: optionalText(30),
});
export interface CreateBranchInput {
  name: string;
  address?: string;
  phone?: string;
}

export const updateBranchSchema = z.object({
  branchId: z.string().uuid(),
  name: name.optional(),
  address: optionalText(200),
  phone: optionalText(30),
});
export interface UpdateBranchInput {
  branchId: string;
  name?: string;
  address?: string;
  phone?: string;
}

export const setBranchAccessSchema = z.object({
  memberId: z.string().uuid(),
  branchIds: z.array(z.string().uuid()).max(200),
});
