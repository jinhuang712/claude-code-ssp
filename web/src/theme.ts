/**
 * Viewer preferences for how the panel looks — per browser, never written to the statusline config.
 *
 * - `pref` is the panel appearance: follow the system, or force light/dark.
 * - `termBg` is the preview terminal's background. It is separate from the panel on purpose:
 *   what matters for the preview is the *user's terminal*, which may be light while the panel is
 *   dark (or the reverse). "auto" follows the panel as a sensible first guess.
 *
 * The resolved scheme is mirrored to <html data-theme>, which index.css keys its tokens on.
 */
import { create } from "zustand";

export type ThemePref = "system" | "light" | "dark";
export type TermBg = "auto" | "light" | "dark";
export type Scheme = "light" | "dark";

const PREF_KEY = "ssp.theme";
const TERM_KEY = "ssp.termBg";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  } catch {
    return fallback; // storage blocked: defaults still work, the choice just isn't remembered
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not persisted; still applies for this page view */
  }
}

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

function resolve(pref: ThemePref): Scheme {
  if (pref === "system") return media?.matches ? "light" : "dark";
  return pref;
}

interface ThemeState {
  pref: ThemePref;
  scheme: Scheme;
  termBg: TermBg;
  setPref(p: ThemePref): void;
  setTermBg(b: TermBg): void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const pref = read<ThemePref>(PREF_KEY, ["system", "light", "dark"], "system");
  // Follow OS changes live while the preference is "system".
  media?.addEventListener("change", () => {
    if (get().pref === "system") set({ scheme: resolve("system") });
  });
  return {
    pref,
    scheme: resolve(pref),
    termBg: read<TermBg>(TERM_KEY, ["auto", "light", "dark"], "auto"),
    setPref(p) {
      write(PREF_KEY, p);
      set({ pref: p, scheme: resolve(p) });
    },
    setTermBg(b) {
      write(TERM_KEY, b);
      set({ termBg: b });
    },
  };
});

/** The terminal background actually used by the preview. */
export function termScheme(s: Pick<ThemeState, "termBg" | "scheme">): Scheme {
  return s.termBg === "auto" ? s.scheme : s.termBg;
}

/** The 16 ANSI colours in xterm order: black red green yellow blue magenta cyan white, then bright. */
export type Palette16 = readonly [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];

/**
 * ANSI palettes for the two grounds. Named colours ("yellow", "green"…) are drawn from the
 * *terminal's* palette, so the preview must use a realistic one per background:
 * - dark: xterm.js's defaults;
 * - light: macOS Terminal "Basic" — light-background terminals ship darker ANSI colours (yellow
 *   #999900, not #c4a000), and using the dark palette on white would understate contrast problems.
 */
export const PALETTES: Record<Scheme, Palette16> = {
  dark: ["#2e3436", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf", "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec"],
  light: ["#000000", "#990000", "#00a600", "#999900", "#0000b2", "#b200b2", "#00a6b2", "#bfbfbf", "#666666", "#e50000", "#00d900", "#e5e500", "#0000ff", "#e500e5", "#00e5e5", "#e5e5e5"],
};

const xtermPalette = (p: Palette16) => ({
  black: p[0], red: p[1], green: p[2], yellow: p[3], blue: p[4], magenta: p[5], cyan: p[6], white: p[7],
  brightBlack: p[8], brightRed: p[9], brightGreen: p[10], brightYellow: p[11], brightBlue: p[12], brightMagenta: p[13], brightCyan: p[14], brightWhite: p[15],
});

/**
 * xterm themes for the two terminal backgrounds. Foregrounds mirror common terminal defaults so
 * dim/muted segments are judged against a realistic ground.
 */
export const TERM_THEMES: Record<Scheme, Record<string, string>> = {
  // Dark is Claude's slate (#141413), not pure black: the preview sits inside a warm panel and a
  // blue-black ground read as a hole in the page. Keep in sync with --term-dark/--term-light.
  dark: { background: "#141413", foreground: "#e8e6dc", cursor: "#141413", selectionBackground: "#3a3935", ...xtermPalette(PALETTES.dark) },
  light: { background: "#ffffff", foreground: "#1f1e1d", cursor: "#ffffff", selectionBackground: "#f3d9cc", ...xtermPalette(PALETTES.light) },
};
