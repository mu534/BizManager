/**
 * Zod validation schemas for authentication inputs.
 *
 * Used on both server (Server Actions, Route Handlers) and client
 * (form validation). Zod v4 API.
 */
import { z } from "zod";

export const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long"),
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

/** Shape sent to POST /api/auth/session */
export const createSessionSchema = z.object({
  idToken: z.string().min(1, "ID token is required"),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
