/**
 * Creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 *   npm run seed
 *
 * Re-running updates the existing account's name and password rather than failing,
 * which doubles as the password-reset path.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const MIN_PASSWORD_LENGTH = 12;

const PLACEHOLDERS = new Set([
  "change-this-long-password",
  "replace-me",
  "password",
  "admin",
  "changeme",
]);

async function main() {
  const name = process.env.ADMIN_NAME || "Subidha Gas Admin";
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set — see .env.example.");
  }

  // A seeded admin is a production login. Refuse to create a guessable one.
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters (got ${password.length}).`,
    );
  }
  if (PLACEHOLDERS.has(password.toLowerCase())) {
    throw new Error("ADMIN_PASSWORD is still the placeholder from .env.example — set a real one.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      create: { name, email, password: hash, role: "ADMIN" },
      update: { name, password: hash },
    });

    console.log(`Admin ready: ${user.email}`);
    console.log("Sign in at /admin/login");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`Seed failed: ${(error as Error).message}`);
  process.exit(1);
});
