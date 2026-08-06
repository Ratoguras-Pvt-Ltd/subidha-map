import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History, LayoutDashboard, LogOut, Store } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth, signOut } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s | Subidha Gas Admin" },
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/dealers", label: "Dealers", icon: Store },
  { href: "/admin/history", label: "Stock History", icon: History },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // The login page has its own layout segment, so anything rendering here must be
  // authenticated. Middleware already redirects, but Server Components must not
  // rely on middleware alone.
  if (!session?.user) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
          <Link href="/admin" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight">
              Subidha Gas
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Admin
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {session.user.name}
            </span>
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/admin/login" });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                <LogOut className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:px-6" aria-label="Admin sections">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </Link>
          ))}
          <Link
            href="/"
            className="ml-auto shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            View public site →
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl p-4 lg:p-6">{children}</main>
    </div>
  );
}
