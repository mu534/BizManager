import { z } from "zod";
import { BODY_MAX, SUBJECT_MAX } from "../support-rules";

// Control characters (other than newline/tab) never belong in support text.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

export const createTicketSchema = z.object({
  subject: z.string().transform(clean).pipe(z.string().trim().min(3, "Give your question a short title.").max(SUBJECT_MAX, "Title is too long.")),
  body: z.string().transform(clean).pipe(z.string().trim().min(5, "Describe what you need help with.").max(BODY_MAX, "Message is too long.")),
});
export type CreateTicketInput = { subject: string; body: string };

export const replySchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().transform(clean).pipe(z.string().trim().min(1, "Write a message.").max(BODY_MAX, "Message is too long.")),
});

export const ticketStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
});
