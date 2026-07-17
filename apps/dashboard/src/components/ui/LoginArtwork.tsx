import { cn } from '@/lib/utils';

/**
 * Premium brand illustration for the login panel.
 *
 * Concept: Keystone is the monitoring & sync hub at the center of a fleet of
 * access-control devices. A glowing central core (the hub) radiates orbit rings;
 * device nodes sit on the rings, each with a live status dot; connection lines
 * carry sync pulses from the hub out to the devices.
 */
const HUB = { x: 400, y: 346 };

const NODES: { x: number; y: number; status: 'ok' | 'warn' | 'off' }[] = [
  { x: 566, y: 388, status: 'ok' },
  { x: 236, y: 300, status: 'ok' },
  { x: 332, y: 568, status: 'warn' },
  { x: 494, y: 140, status: 'ok' },
  { x: 110, y: 472, status: 'ok' },
  { x: 690, y: 476, status: 'off' },
];

const STATUS: Record<'ok' | 'warn' | 'off', string> = {
  ok: '#34d399',
  warn: '#fbbf24',
  off: '#fb7185',
};

// Lines that currently have an active sync pulse travelling along them.
const PULSES = [0, 3];

export function LoginArtwork({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      className={cn('h-full w-full', className)}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="hub-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#c4b5fd" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hub-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="link" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="device-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
        </linearGradient>
        <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.3" fill="#ffffff" fillOpacity="0.07" />
        </pattern>
        <symbol id="device" overflow="visible">
          <rect x="-19" y="-19" width="38" height="38" rx="10" fill="url(#device-fill)" stroke="#ffffff" strokeOpacity="0.3" />
          <rect x="-12" y="-13" width="24" height="7" rx="2" fill="#ffffff" fillOpacity="0.16" />
          <circle cx="0" cy="4" r="5.5" fill="#0b0614" />
          <circle cx="0" cy="4" r="5.5" fill="none" stroke="#ffffff" strokeOpacity="0.4" />
          <circle cx="0" cy="4" r="2" fill="#c4b5fd" />
        </symbol>
      </defs>

      {/* dot grid */}
      <rect x="0" y="0" width="800" height="900" fill="url(#grid)" />

      {/* hub halo */}
      <circle cx={HUB.x} cy={HUB.y} r="320" fill="url(#hub-halo)" />

      {/* orbit rings */}
      <g fill="none" stroke="#ffffff">
        <circle cx={HUB.x} cy={HUB.y} r="150" strokeOpacity="0.16" />
        <circle cx={HUB.x} cy={HUB.y} r="238" strokeOpacity="0.10" strokeDasharray="2 7" />
        <circle cx={HUB.x} cy={HUB.y} r="318" strokeOpacity="0.06" />
      </g>

      {/* connection links + sync pulses */}
      <g>
        {NODES.map((n, i) => (
          <line
            key={`l-${i}`}
            x1={HUB.x} y1={HUB.y} x2={n.x} y2={n.y}
            stroke="url(#link)" strokeWidth="1.25"
          />
        ))}
        {NODES.map((n, i) => {
          if (!PULSES.includes(i)) return null;
          const t = 0.42;
          const px = HUB.x + (n.x - HUB.x) * t;
          const py = HUB.y + (n.y - HUB.y) * t;
          return (
            <g key={`p-${i}`}>
              <circle cx={px} cy={py} r="7" fill="#a855f7" fillOpacity="0.25" />
              <circle cx={px} cy={py} r="3.2" fill="#ffffff" />
            </g>
          );
        })}
      </g>

      {/* device nodes + status dots */}
      <g>
        {NODES.map((n, i) => (
          <g key={`n-${i}`}>
            <use href="#device" x={n.x} y={n.y} />
            <circle cx={n.x + 15} cy={n.y - 15} r="9" fill={STATUS[n.status]} fillOpacity="0.18" />
            <circle cx={n.x + 15} cy={n.y - 15} r="3.6" fill={STATUS[n.status]} />
          </g>
        ))}
      </g>

      {/* central hub */}
      <g>
        <circle cx={HUB.x} cy={HUB.y} r="74" fill="url(#hub-core)" />
        <circle cx={HUB.x} cy={HUB.y} r="40" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />
        <circle cx={HUB.x} cy={HUB.y} r="52" fill="none" stroke="#ffffff" strokeOpacity="0.14" />
        {/* keystone glyph at the core */}
        <g transform={`translate(${HUB.x} ${HUB.y})`}>
          <path d="M -15 -16 L 15 -16 L 9 18 L -9 18 Z" fill="#0b0614" fillOpacity="0.55" />
          <path d="M -15 -16 L 15 -16 L 9 18 L -9 18 Z" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" />
          <circle cx="0" cy="-2" r="3.4" fill="#ffffff" />
          <path d="M 0 1 L 2 9 L -2 9 Z" fill="#ffffff" />
        </g>
      </g>

      {/* floating particles */}
      <g fill="#ffffff">
        <circle cx="180" cy="200" r="2" fillOpacity="0.5" />
        <circle cx="640" cy="250" r="1.6" fillOpacity="0.4" />
        <circle cx="150" cy="640" r="2.2" fillOpacity="0.35" />
        <circle cx="610" cy="660" r="1.4" fillOpacity="0.45" />
        <circle cx="430" cy="760" r="1.8" fillOpacity="0.3" />
      </g>
    </svg>
  );
}
