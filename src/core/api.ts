import type { Segment, Style, ThemeDef, WidgetApi } from "./types.js";

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function formatRelative(when: number | Date, now = Date.now()): string {
  let t = when instanceof Date ? when.getTime() : when;
  if (t < 1e12) t *= 1000; // unix seconds → ms
  const delta = t - now;
  if (Math.abs(delta) < 1000) return "now";
  return delta > 0 ? `in ${formatDuration(delta)}` : `${formatDuration(-delta)} ago`;
}

export function level(pct: number, warnAt = 70, critAt = 85): "ok" | "warn" | "crit" {
  if (pct >= critAt) return "crit";
  if (pct >= warnAt) return "warn";
  return "ok";
}

/** Colour stops for the gradient mode; interpolated linearly in RGB between neighbours. */
const GRADIENT: Array<[number, string]> = [
  [0, "#ffffff"],
  [10, "#7fc8ff"],
  [30, "#62c46a"],
  [50, "#f5e07a"],
  [70, "#ff9e3d"],
  [90, "#ef4444"],
  [100, "#b91c1c"],
];

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function gradient(pct: number, stops: Array<[number, string]> = GRADIENT): string {
  const p = Math.max(0, Math.min(100, pct));
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1]![0]) i++;
  const [p0, c0] = stops[i]!;
  const [p1, c1] = stops[i + 1]!;
  const t = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
  const a = hexToRgb(c0);
  const b = hexToRgb(c1);
  const mix = a.map((v, k) => Math.round(v + (b[k]! - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function bar(pct: number, width: number, theme: ThemeDef): string {
  const w = Math.max(1, Math.floor(width));
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * w);
  const glyphs = theme.bar ?? { filled: "█", empty: "░" };
  return glyphs.filled.repeat(filled) + glyphs.empty.repeat(w - filled);
}

export function createApi(theme: ThemeDef, now: number): WidgetApi {
  return {
    level,
    bar: (pct, width = 10) => bar(pct, width, theme),
    gradient,
    tokens: formatTokens,
    duration: formatDuration,
    relative: (when, at = now) => formatRelative(when, at),
    seg: (text: string, style?: Style): Segment => (style ? { text, style } : { text }),
  };
}
