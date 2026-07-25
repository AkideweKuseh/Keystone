import { useId } from 'react';
import { cn } from '@/lib/utils';

interface AreaSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;        // stroke + gradient top
  fill?: boolean;        // gradient area fill
  showDot?: boolean;     // marker on the last point
  className?: string;
  strokeWidth?: number;
}

/** Dependency-free SVG area/line sparkline. Normalizes to the data's min/max. */
export function AreaSparkline({
  data,
  width = 120,
  height = 40,
  color = '#a855f7',
  fill = true,
  showDot = true,
  strokeWidth = 2,
  className,
}: AreaSparklineProps) {
  const gradId = useId();
  const n = data.length;
  const pad = strokeWidth;

  if (n === 0) {
    return <svg width={width} height={height} className={className} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;

  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const areaPath =
    n > 1
      ? `${linePath} L${points[n - 1][0].toFixed(2)} ${height - pad} L${points[0][0].toFixed(2)} ${height - pad} Z`
      : '';
  const last = points[n - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && n > 1 && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDot && n > 0 && (
        <circle cx={last[0]} cy={last[1]} r={strokeWidth + 1} fill={color} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
