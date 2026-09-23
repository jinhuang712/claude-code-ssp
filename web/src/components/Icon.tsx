/**
 * The panel's few icons, as inline stroke SVGs (1.5px strokes on a 16px grid, `currentColor`).
 *
 * Why not glyphs: arrows like ↶ and ＋ come from whatever fallback font has them, so their size and
 * weight drifted per OS and sat off the text baseline. Why not an icon library: seven icons don't
 * justify a dependency. Icons are always decorative here — the button around one carries the
 * accessible name — so every icon is aria-hidden.
 */
const PATHS = {
  plus: "M8 3v10M3 8h10",
  x: "M4 4l8 8M12 4l-8 8",
  chevron: "M6 3.5 10.5 8 6 12.5",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM10.7 10.7 14 14",
  external: "M6.5 3.5h-3v9h9v-3M9 2.5h4.5V7M13.5 2.5 7.5 8.5",
  // Three dots drawn as tiny rings: a 1.5px stroke around r=1 reads as a filled 3.5px dot.
  more: "M2.5 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0M7 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11.5 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
  // Three slider tracks with a knob each: "settings for this view".
  sliders: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11M10 3v3M5.5 6.5v3M11 10v3",
} as const;

export type IconName = keyof typeof PATHS;

/**
 * A 16px (by default, at a 16px root) stroke icon that inherits the text colour. Sized in rem so it
 * scales with the page's type (index.css).
 */
export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const edge = `${size / 16}rem`;
  return (
    <svg
      className={`icon ${className ?? ""}`}
      style={{ width: edge, height: edge }}
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
