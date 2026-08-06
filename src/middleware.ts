import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Only the edge-safe config here — see the note in auth.config.ts.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Guard the dashboard; skip static assets, the auth endpoints and the public API.
  matcher: ["/admin/:path*"],
};
