import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config. Middleware runs on the Edge runtime, which
 * cannot load Prisma or bcrypt — so the Credentials provider (and everything it
 * pulls in) lives in auth.ts and is added on top of this. Keep this file free of
 * Node-only imports.
 */
export const authConfig = {
  pages: {
    signIn: "/admin/login",
  },
  providers: [],
  callbacks: {
    /** Gate for middleware: every /admin route except the login page needs a session. */
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/admin/login")) return true;
      if (pathname.startsWith("/admin")) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.role = "ADMIN";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
