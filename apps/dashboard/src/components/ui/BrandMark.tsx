import { cn } from '@/lib/utils';

/**
 * Keystone glyph — the wedge stone at the crown of an arch.
 * Fits an access-control product (doors / portals) and carries a subtle
 * keyhole. Uses a violet→indigo→fuchsia brand gradient.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ks-grad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a855f7" />
          <stop offset="0.5" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {/* Keystone wedge: wider at the top (crown of the arch) */}
      <path
        d="M5 4h14l-2.4 15.2a1 1 0 0 1-1 .8H8.4a1 1 0 0 1-1-.8L5 4Z"
        fill="url(#ks-grad)"
      />
      {/* Keyhole */}
      <circle cx="12" cy="10.4" r="1.7" fill="#0a0a0f" />
      <path d="M12 11.6l.7 3.4h-1.4l.7-3.4Z" fill="#0a0a0f" />
    </svg>
  );
}

/** Gradient tile wrapping the keystone glyph, with a soft inner highlight. */
export function BrandTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-xl',
        'bg-gradient-to-br from-[#a855f7] via-[#8b5cf6] to-[#6366f1]',
        'shadow-[0_6px_24px_-6px_rgba(168,85,247,0.6)]',
        className,
      )}
    >
      {/* top sheen */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 to-transparent" />
      <BrandMark className="relative h-1/2 w-1/2" />
    </span>
  );
}
