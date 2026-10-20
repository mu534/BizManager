import { z } from "zod";

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  role: z.enum(["MANAGER", "STAFF"], { message: "Choose a role." }),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["MANAGER", "STAFF"]).optional(),
  financialReportAccess: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
