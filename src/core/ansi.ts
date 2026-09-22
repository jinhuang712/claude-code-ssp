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
  // "default" = the terminal's own foreground/background: emit no colour code (SGR 39/49 behaviour).
  if (v === "default") return null;
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

/**
 * Terminal cell width of a string: escape sequences count 0, CJK and emoji count 2.
 *
 * Delegates to `Bun.stringWidth`, which implements the same rules as the `string-width` package
 * that Claude Code's own UI (Ink) uses to lay out the statusline row. Matching it matters more than
 * matching any one terminal: if we measure `⚠️` (VS16 emoji presentation) or a ZWJ family emoji
 * differently from Ink, right-aligned zones end up one cell off or wrap. It is also ~17× faster
 * than the old per-code-point table and understands SGR plus both OSC 8 terminators (BEL / ST).
 */
export function visualWidth(s: string): number {
  return Bun.stringWidth(s);
}

/*
  One token of a styled string: either an escape sequence (zero width, copied verbatim) or plain
  text. Covers every escape the renderer emits: SGR (`ESC[…m`), any other CSI, and OSC 8
  hyperlinks terminated by BEL or ST (`ESC\`).
*/
// eslint-disable-next-line no-control-regex
const ESCAPE_TOKEN_RE = /\x1b\[[0-9;:?]*[A-Za-z]|\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * Truncate a (possibly styled) string to `max` visible cells, appending an ellipsis when cut.
 *
 * Escape sequences cost no width and are kept, so colours survive the cut. Text is cut on grapheme
 * boundaries so a ZWJ emoji or a base letter plus combining mark is never split in half. When the
 * cut lands inside a colour or a hyperlink, both are closed after the ellipsis — otherwise the
 * colour bleeds into whatever Claude Code prints next and an unterminated OSC 8 can turn the rest
 * of the terminal line into one giant link.
 */
export function truncateVisual(s: string, max: number, ellipsis = "…"): string {
  if (visualWidth(s) <= max) return s;
  if (max <= 0) return "";
  const budget = Math.max(0, max - visualWidth(ellipsis));
  let out = "";
  let w = 0;
  let sgrOpen = false;
  let linkOpen = false;
  let last = 0;
  const takeText = (text: string): boolean => {
    for (const { segment } of graphemes.segment(text)) {
      const cw = Bun.stringWidth(segment);
      if (w + cw > budget) return false;
      out += segment;
      w += cw;
    }
    return true;
  };
  for (const m of s.matchAll(ESCAPE_TOKEN_RE)) {
    if (!takeText(s.slice(last, m.index))) return close();
    const esc = m[0];
    out += esc;
    if (esc.startsWith("\x1b]8;")) linkOpen = (m[1] ?? "") !== "";
    else if (esc.endsWith("m")) {
      // `ESC[m` and `ESC[0m` reset everything; any other SGR leaves some attribute switched on.
      const params = esc.slice(2, -1);
      sgrOpen = !(params === "" || params === "0");
    }
    last = m.index + esc.length;
  }
  takeText(s.slice(last));
  return close();

  function close(): string {
    return out + ellipsis + (linkOpen ? "\x1b]8;;\x07" : "") + (sgrOpen ? RESET : "");
  }
}
