/**
 * Prisma Client singleton for the Next.js application.
 *
 * Next.js hot-reload (in development) re-evaluates module files,
 * which would create a new PrismaClient instance on every reload
 * and exhaust the PostgreSQL connection pool. This singleton
 * pattern stores one instance on globalThis to survive hot reloads.
 *
 * In production, the module is evaluated once — globalThis is not
 * used, and the `if` branch at the bottom is skipped.
 *
 * IMPORTANT: This file is server-only.
 * Never import it from 'use client' components or src/client/.
 * The ESLint boundary rule in eslint.config.mjs enforces this.
 *
 * Usage:
 *   import { prisma } from '@server/db/prisma';
 *   const users = await prisma.user.findMany();
 */
import { PrismaClient } from "@prisma/client";

// Extend globalThis with the prisma cache property.
// We use `unknown` → cast to avoid introducing `any`.
const globalWithPrisma = globalThis as typeof globalThis & {
  _prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma._prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalWithPrisma._prisma = prisma;
}
