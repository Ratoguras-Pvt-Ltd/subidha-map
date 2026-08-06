"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";
import { LOGIN_LIMIT, clientIp, rateLimit } from "@/lib/rate-limit";

export type LoginState = { error: string } | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Deliberately vague: never reveal whether the email exists or the password was
  // the wrong one.
  const INVALID = { error: "Invalid email or password." };

  if (!parsed.success) return INVALID;

  const ip = clientIp(await headers());
  const limit = rateLimit(`login:${ip}:${parsed.data.email.toLowerCase()}`, LOGIN_LIMIT);
  if (!limit.ok) {
    return {
      error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfter / 60)} minute(s).`,
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) return INVALID;
    // signIn throws a NEXT_REDIRECT on success — let it through.
    throw error;
  }

  return null;
}
