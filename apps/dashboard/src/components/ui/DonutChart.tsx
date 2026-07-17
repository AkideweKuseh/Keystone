import { cn } from '@/lib/utils';

export interface DonutSegment {
  label: string;
  value: number;
  color: string; // any CSS color
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: string | number;
  centerLabel?: string;
  className?: string;
}

/** Dependency-free SVG donut. Segments rendered with stroke-dasharray. */
export function DonutChart({
  segments,
  size = 168,
  thickness = 18,
  centerValue,
  centerLabel,
  className,
}: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  const gap = total > 0 ? 0 : 0; // no gaps between segments

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg, i) => {
      const frac = total > 0 ? seg.value / total : 0;
      const dash = Math.max(frac * circ - gap, 0);
      const circle = (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={seg.color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={-offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      );
      offset += frac * circ;
      return circle;
    });

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block">
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={thickness}
        />
        {total > 0 ? arcs : null}
      </svg>
      {(centerValue !== undefined || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue !== undefined && (
            <span className="text-2xl font-bold tracking-tight text-zinc-50 tabular">{centerValue}</span>
          )}
          {centerLabel && <span className="text-[11px] font-medium text-zinc-500">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
