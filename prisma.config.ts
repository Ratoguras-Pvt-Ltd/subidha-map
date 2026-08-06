import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // The CLI (migrate/studio) wants a direct, unpooled connection. Neon hands out
    // both; DIRECT_URL falls back to DATABASE_URL for plain local Postgres.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
