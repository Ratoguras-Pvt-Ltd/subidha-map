import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "./auth.config";
import { prisma } from "./prisma";
import { loginSchema } from "./validations";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        // Compare against a dummy hash when the user is missing so a wrong email and
        // a wrong password take the same time — no user enumeration via timing.
        const hash = user?.password ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
