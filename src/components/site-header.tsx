import Link from "next/link";

import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader({ dealerCount }: { dealerCount?: number }) {
  return (
    <header className="flex h-[var(--header-h)] items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">Subidha Gas</span>
            <span className="block text-[11px] text-muted-foreground">Dealer Locator</span>
          </span>
        </Link>
        <span className="text-xs font-medium text-muted-foreground">×</span>
        <a
          href="https://ratoguras.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5"
          aria-label="Ratoguras"
        >
          <img src="/ratoguras-logo.png" alt="Ratoguras" className="size-10 rounded-lg" />
          <span className="text-sm font-semibold tracking-tight">Ratoguras</span>
        </a>
      </div>

      <div className="flex items-center gap-2">
        {dealerCount !== undefined ? (
          <p className="hidden text-xs text-muted-foreground sm:block">
            <span className="font-semibold tabular-nums text-foreground">{dealerCount}</span>{" "}
            dealers across eastern Nepal
          </p>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
