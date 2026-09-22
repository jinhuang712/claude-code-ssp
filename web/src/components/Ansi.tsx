import type { CSSProperties, ReactNode } from "react";
import { termScheme, useTheme } from "../theme";

/**
 * Renders a line of statusline output (SGR colours + OSC 8 links) as styled spans, for the small
 * samples in the options drawer and picker. The big preview uses xterm.js; this is its lightweight
 * sibling, so samples show real colours instead of stripped plain text.
 *
 * The 16 base colours match xterm.js's default palette so a sample and the preview agree.
 */
const BASE16 = [
  "#2e3436", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf",
  "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
];

/** xterm 256-colour index → hex: 0–15 base, 16–231 a 6×6×6 cube, 232–255 a grey ramp. */
function color256(n: number): string {
  if (n < 16) return BASE16[n]!;
  if (n < 232) {
    const i = n - 16;
    const step = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    const [r, g, b] = [Math.floor(i / 36), Math.floor(i / 6) % 6, i % 6].map(step);
    return `rgb(${r},${g},${b})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v},${v},${v})`;
}

interface Sgr {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strike?: boolean;
}

/** Apply one SGR parameter list to the running style (mutates and returns it). */
function applySgr(st: Sgr, params: number[]): Sgr {
  if (params.length === 0) params = [0];
  for (let i = 0; i < params.length; i++) {
    const p = params[i]!;
    if (p === 0) Object.keys(st).forEach((k) => delete st[k as keyof Sgr]);
    else if (p === 1) st.bold = true;
    else if (p === 2) st.dim = true;
    else if (p === 3) st.italic = true;
    else if (p === 4) st.underline = true;
    else if (p === 7) st.inverse = true;
    else if (p === 9) st.strike = true;
    else if (p === 22) st.bold = st.dim = false;
    else if (p === 23) st.italic = false;
    else if (p === 24) st.underline = false;
    else if (p === 27) st.inverse = false;
    else if (p === 29) st.strike = false;
    else if (p >= 30 && p <= 37) st.fg = BASE16[p - 30];
    else if (p >= 90 && p <= 97) st.fg = BASE16[p - 90 + 8];
    else if (p >= 40 && p <= 47) st.bg = BASE16[p - 40];
    else if (p >= 100 && p <= 107) st.bg = BASE16[p - 100 + 8];
    else if (p === 39) delete st.fg;
    else if (p === 49) delete st.bg;
    else if (p === 38 || p === 48) {
      // Extended colour: 38;5;n (256) or 38;2;r;g;b (truecolor). Consumes the extra parameters.
      const key = p === 38 ? "fg" : "bg";
      if (params[i + 1] === 5) {
        st[key] = color256(params[i + 2] ?? 0);
        i += 2;
      } else if (params[i + 1] === 2) {
        st[key] = `rgb(${params[i + 2] ?? 0},${params[i + 3] ?? 0},${params[i + 4] ?? 0})`;
        i += 4;
      }
    }
  }
  return st;
}

function styleOf(st: Sgr): CSSProperties {
  const css: CSSProperties = {};
  const fg = st.inverse ? (st.bg ?? "var(--term-bg)") : st.fg;
  const bg = st.inverse ? (st.fg ?? "var(--term-fg)") : st.bg;
  if (fg) css.color = fg;
  if (bg) css.background = bg;
  if (st.bold) css.fontWeight = 700;
  // Terminals render "dim" as the colour blended halfway into the background.
  if (st.dim) css.opacity = 0.55;
  if (st.italic) css.fontStyle = "italic";
  const deco = [st.underline && "underline", st.strike && "line-through"].filter(Boolean).join(" ");
  if (deco) css.textDecoration = deco;
  return css;
}

// CSI SGR, or an OSC 8 hyperlink open/close terminated by BEL or ST.
// eslint-disable-next-line no-control-regex
const TOKEN = /\x1b\[([0-9;]*)m|\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

/** Parse into [text, style, href] runs. Exported for tests and for plain-text fallbacks. */
export function parseAnsi(input: string): Array<{ text: string; style: CSSProperties; href: string | null }> {
  const runs: Array<{ text: string; style: CSSProperties; href: string | null }> = [];
  const st: Sgr = {};
  let href: string | null = null;
  let last = 0;
  for (const m of input.matchAll(TOKEN)) {
    if (m.index! > last) runs.push({ text: input.slice(last, m.index), style: styleOf(st), href });
    if (m[1] !== undefined) applySgr(st, m[1] === "" ? [] : m[1].split(";").map(Number));
    else href = m[2] ? m[2] : null;
    last = m.index! + m[0].length;
  }
  if (last < input.length) runs.push({ text: input.slice(last), style: styleOf(st), href });
  return runs;
}

/** One sample on a patch of terminal ground (dark or light, following the preview's setting). */
export function Ansi({ text, className, fallback }: { text: string; className?: string; fallback?: ReactNode }) {
  const scheme = useTheme(termScheme);
  const runs = parseAnsi(text);
  const empty = runs.every((r) => r.text.trim() === "");
  return (
    <span className={`ansi mono ${className ?? ""}`} data-scheme={scheme}>
      {empty
        ? (fallback ?? "")
        : runs.map((r, i) => (
            <span key={i} style={r.style} className={r.href ? "ansi-link" : undefined} title={r.href ?? undefined}>
              {r.text}
            </span>
          ))}
    </span>
  );
}
