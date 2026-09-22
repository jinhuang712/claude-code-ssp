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

/**
 * xterm palettes for the two terminal backgrounds. Foregrounds mirror common terminal defaults
 * (light ≈ macOS Terminal "Basic", dark ≈ the panel's own deep background) so dim/muted segments
 * are judged against a realistic ground.
 */
export const TERM_THEMES: Record<Scheme, { background: string; foreground: string; cursor: string; selectionBackground: string }> = {
  dark: { background: "#0b0e13", foreground: "#dfe4ec", cursor: "#0b0e13", selectionBackground: "#2a3342" },
  light: { background: "#ffffff", foreground: "#1f2328", cursor: "#ffffff", selectionBackground: "#cfe3ff" },
};
