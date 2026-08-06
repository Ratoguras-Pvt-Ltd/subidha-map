import { MapPin } from "lucide-react";

export function MapSkeleton() {
  return (
    <div
      className="grid size-full place-items-center bg-slate-100 dark:bg-slate-900"
      role="status"
      aria-label="Loading map"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <MapPin className="size-8 animate-pulse" aria-hidden />
        <p className="text-sm">Loading dealer map…</p>
      </div>
    </div>
  );
}
