"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      // 44px below `lg` for the public page's touch-target floor; both header bars
      // are h-14 so this still fits. Spills into the admin header too — a strict
      // improvement on a phone, no change on desktop.
      className="size-11 lg:size-8"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </Button>
  );
}
