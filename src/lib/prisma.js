import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// the Postgres connection pool.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
