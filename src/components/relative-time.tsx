"use client";

import { useEffect, useState } from "react";

import { relativeTime } from "@/lib/stock";

/**
 * "15 minutes ago", safe inside a cached page.
 *
 * The homepage is served from a tag cache for up to 5 minutes, so the HTML was
 * rendered at one moment and hydrated at a later one — "2 minutes ago" on the server
 * against "1 minute ago" on the client is a guaranteed hydration mismatch. The
 * suppress flag accepts that the two legitimately differ, and the mount effect then
 * corrects the text to the reader's actual now.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => relativeTime(iso));

  useEffect(() => {
    setLabel(relativeTime(iso));
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
