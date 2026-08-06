import { cn } from "@/lib/utils";

/**
 * The Subidha Gas mark. Same geometry as src/app/icon.svg — two mirrored lobes
 * split by a diagonal — so the header and the browser tab stay identical.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-8 rounded-lg", className)}
      role="img"
      aria-label="Subidha Gas"
    >
      <rect width="100" height="100" fill="#C4161C" />
      <g fill="#ffffff">
        <path d="M86 14 L44 14 A19 19 0 0 0 44 52 Z" />
        <g transform="rotate(180 50 50)">
          <path d="M86 14 L44 14 A19 19 0 0 0 44 52 Z" />
        </g>
      </g>
    </svg>
  );
}
