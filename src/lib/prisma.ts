import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter; the connection string is supplied here in
// application code, not in schema.prisma. DATABASE_URL should be Neon's *pooled*
// URL (…-pooler.…) so serverless invocations don't exhaust connections.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

// Without this, every hot reload in dev opens a new pool.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
