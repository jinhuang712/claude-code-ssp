/**
 * The panel's few icons, as inline stroke SVGs (1.5px strokes on a 16px grid, `currentColor`).
 *
 * Why not glyphs: arrows like ↶ and ＋ come from whatever fallback font has them, so their size and
 * weight drifted per OS and sat off the text baseline. Why not an icon library: seven icons don't
 * justify a dependency. Icons are always decorative here — the button around one carries the
 * accessible name — so every icon is aria-hidden.
 */
const PATHS = {
  undo: "M5.5 4 2.5 7l3 3M3 7h6.5a3.5 3.5 0 0 1 0 7H7",
  plus: "M8 3v10M3 8h10",
  x: "M4 4l8 8M12 4l-8 8",
  chevron: "M6 3.5 10.5 8 6 12.5",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM10.7 10.7 14 14",
  reset: "M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.8h2.8",
  external: "M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5 7.5 8.5",
} as const;

export type IconName = keyof typeof PATHS;

/** A 16px (by default) stroke icon that inherits the text colour. */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
