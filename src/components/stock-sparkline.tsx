import { deriveStatus, STATUS_PRESENTATION, SYSTEM_ACTOR } from "@/lib/stock";

export type StockPoint = {
  updatedAt: string;
  newQuantity: number;
  updatedBy: string;
  updatedByName: string | null;
};

const WIDTH = 600;
const HEIGHT = 160;
const PAD_X = 8;
const PAD_Y = 12;

/**
 * Plain inline SVG, not a charting library — one series, a few dozen points at
 * most, doesn't earn a dependency. Reference lines sit at the same 10/50
 * thresholds deriveStatus() uses, so this chart can never disagree with the rest
 * of the app about what counts as low.
 */
export function StockSparkline({ points }: { points: StockPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No stock changes recorded yet.
      </p>
    );
  }

  const times = points.map((p) => new Date(p.updatedAt).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeSpan = maxTime - minTime || 1;

  const maxQuantity = Math.max(50, ...points.map((p) => p.newQuantity));

  const x = (t: number) => PAD_X + ((t - minTime) / timeSpan) * (WIDTH - 2 * PAD_X);
  const y = (q: number) => HEIGHT - PAD_Y - (q / maxQuantity) * (HEIGHT - 2 * PAD_Y);

  const polylinePoints = points.map((p) => `${x(new Date(p.updatedAt).getTime())},${y(p.newQuantity)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-40 w-full" role="img" aria-label="Stock over time">
      <line
        x1={PAD_X}
        x2={WIDTH - PAD_X}
        y1={y(10)}
        y2={y(10)}
        stroke={STATUS_PRESENTATION.CRITICAL.hex}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.4}
      />
      <line
        x1={PAD_X}
        x2={WIDTH - PAD_X}
        y1={y(50)}
        y2={y(50)}
        stroke={STATUS_PRESENTATION.AVAILABLE.hex}
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.4}
      />

      <polyline points={polylinePoints} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-muted-foreground" />

      {points.map((p, i) => {
        const isReset = p.updatedBy === SYSTEM_ACTOR;
        const hex = STATUS_PRESENTATION[deriveStatus(p.newQuantity)].hex;
        const cx = x(new Date(p.updatedAt).getTime());
        const cy = y(p.newQuantity);
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={isReset ? 3 : 4}
            fill={isReset ? "none" : hex}
            stroke={hex}
            strokeWidth={isReset ? 1.5 : 0}
          >
            <title>
              {new Date(p.updatedAt).toLocaleString()} — {p.newQuantity} cylinders
              {isReset ? " (nightly reset)" : ` — ${p.updatedByName ?? "Unknown"}`}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
