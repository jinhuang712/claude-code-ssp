/**
 * ANSI styling, color-level downgrade, OSC 8 links and visual width measurement.
 */
import type { Color, ColorLevel, Segment, Style, ThemeDef } from "./types.js";

export const RESET = "\x1b[0m";

const NAMED: Record<string, number> = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7,
  brightBlack: 8, gray: 8, grey: 8, brightRed: 9, brightGreen: 10, brightYellow: 11,
  brightBlue: 12, brightMagenta: 13, brightCyan: 14, brightWhite: 15,
};

export type ResolvedColor = { kind: "16"; index: number } | { kind: "256"; index: number } | { kind: "rgb"; r: number; g: number; b: number };

export function detectColorLevel(env: NodeJS.ProcessEnv = process.env): Exclude<ColorLevel, "auto"> {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (env.FORCE_COLOR === "0") return "none";
  const ct = env.COLORTERM?.toLowerCase() ?? "";
  if (ct.includes("truecolor") || ct.includes("24bit")) return "truecolor";
  const term = env.TERM ?? "";
  if (term.includes("256color")) return "256";
  if (env.TERM_PROGRAM || term) return "256";
  return "16";
}

/** Resolve a token or literal to a concrete color. Returns null for unknown values. */
export function resolveColor(value: Color | undefined, theme: ThemeDef, depth = 0): ResolvedColor | null {
  if (!value || depth > 4) return null;
  const v = value.trim();
  if (v in theme.tokens && theme.tokens[v] !== v) return resolveColor(theme.tokens[v], theme, depth + 1);
  if (v in NAMED) return { kind: "16", index: NAMED[v]! };
  if (/^#?[0-9a-f]{6}$/i.test(v)) {
    const hex = v.replace("#", "");
    return { kind: "rgb", r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  if (/^\d{1,3}$/.test(v)) {
    const n = Number(v);
    if (n >= 0 && n <= 255) return n < 16 ? { kind: "16", index: n } : { kind: "256", index: n };
  }
  return null;
}

function rgbTo256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const q = (x: number) => Math.round((x / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function rgbTo16(r: number, g: number, b: number): number {
  const bright = Math.max(r, g, b) > 170;
  const idx = (r > 127 ? 1 : 0) | (g > 127 ? 2 : 0) | (b > 127 ? 4 : 0);
  return bright ? idx + 8 : idx;
}

function sgrColor(c: ResolvedColor, level: Exclude<ColorLevel, "auto">, bg: boolean): string {
  if (level === "none") return "";
  const base = bg ? 40 : 30;
  let resolved = c;
  if (level === "256" && resolved.kind === "rgb") resolved = { kind: "256", index: rgbTo256(resolved.r, resolved.g, resolved.b) };
  if (level === "16") {
    if (resolved.kind === "rgb") resolved = { kind: "16", index: rgbTo16(resolved.r, resolved.g, resolved.b) };
    else if (resolved.kind === "256") resolved = { kind: "16", index: resolved.index % 16 };
  }
  switch (resolved.kind) {
    case "16":
      return resolved.index < 8 ? `${base + resolved.index}` : `${base + 60 + resolved.index - 8}`;
    case "256":
      return `${base + 8};5;${resolved.index}`;
    case "rgb":
      return `${base + 8};2;${resolved.r};${resolved.g};${resolved.b}`;
  }
}

export function styleOpen(style: Style | undefined, theme: ThemeDef, level: Exclude<ColorLevel, "auto">): string {
  if (!style || level === "none") return "";
  const parts: string[] = [];
  if (style.bold) parts.push("1");
  if (style.dim) parts.push("2");
  if (style.italic) parts.push("3");
  if (style.underline) parts.push("4");
  const fg = resolveColor(style.fg, theme);
  if (fg) parts.push(sgrColor(fg, level, false));
  const bg = resolveColor(style.bg, theme);
  if (bg) parts.push(sgrColor(bg, level, true));
  return parts.length ? `\x1b[${parts.join(";")}m` : "";
}

export function renderSegment(seg: Segment, theme: ThemeDef, level: Exclude<ColorLevel, "auto">): string {
  const open = styleOpen(seg.style, theme, level);
  let body = seg.text;
  if (seg.link && level !== "none") body = `\x1b]8;;${seg.link}\x07${body}\x1b]8;;\x07`;
  return open ? `${open}${body}${RESET}` : body;
}

export function renderSegments(segs: Segment[], theme: ThemeDef, level: Exclude<ColorLevel, "auto">): string {
  return segs.map((s) => renderSegment(s, theme, level)).join("");
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff ||
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  );
}

/** Terminal cell width of a string (ANSI stripped, CJK/emoji counted as 2). */
export function visualWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0)!;
    if (cp < 32 || cp === 0x7f) continue;
    if (isZeroWidth(cp)) continue;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
}

/** Truncate a plain string to `max` cells, appending an ellipsis when cut. */
export function truncateVisual(s: string, max: number, ellipsis = "…"): string {
  if (visualWidth(s) <= max) return s;
  const budget = Math.max(0, max - visualWidth(ellipsis));
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = visualWidth(ch);
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return out + ellipsis;
}
