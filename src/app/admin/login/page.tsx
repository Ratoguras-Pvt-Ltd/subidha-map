import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Staff Sign In",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/admin");

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-12 rounded-xl shadow-lg shadow-red-600/25" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Subidha Gas</h1>
            <p className="text-sm text-muted-foreground">Staff dashboard</p>
          </div>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Authorised personnel only. All stock changes are logged.
        </p>
      </div>
    </main>
  );
}
