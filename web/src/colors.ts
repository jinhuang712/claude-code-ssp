/** Terminal colour names → UI hex. Tuned to read on the panel's dark ground, not the 16-colour ANSI defaults. */
const NAMED: Record<string, string> = {
  black: "#1a1f27",
  red: "#ef5f66",
  green: "#62c46a",
  yellow: "#e8c547",
  blue: "#6b8cff",
  magenta: "#c76bd6",
  cyan: "#4cc9e0",
  white: "#e6e9ef",
  gray: "#8a94a6",
  grey: "#8a94a6",
  brightBlack: "#5c6675",
  brightRed: "#ff7b81",
  brightGreen: "#7ddc85",
  brightYellow: "#f5d76e",
  brightBlue: "#7aa2f7",
  brightMagenta: "#d98be6",
  brightCyan: "#7fe0f2",
  brightWhite: "#ffffff",
};

export function uiColor(v: string | undefined, fallback = "#8a94a6"): string {
  if (!v) return fallback;
  // The terminal's own foreground: in the panel that is simply the current text colour.
  if (v === "default") return "currentColor";
  if (v.startsWith("#")) return v;
  return NAMED[v] ?? fallback;
}

/** Category colours for widget chips; one hue per data family. */
export const CAT_COLOR: Record<string, string> = {
  model: "#7aa2f7",
  project: "#e0af68",
  git: "#bb9af7",
  context: "#9ece6a",
  usage: "#7dcfff",
  cost: "#f7768e",
  session: "#c0caf5",
  activity: "#ff9e64",
  environment: "#73daca",
  misc: "#9aa5ce",
};

/**
 * The statusline's gradient colour mode (src/core/api.ts `GRADIENT` / `gradient()`), for the Style
 * swatches. The panel can't import the engine — web/dist is fingerprinted from web/ alone — so this
 * is a copy; tests/web-gradient.test.ts fails if the two ever disagree.
 */
const GRADIENT: Array<[number, string]> = [
  [0, "#8a8a8a"],
  [10, "#3d8fe0"],
  [30, "#2f9e44"],
  [50, "#a8840a"],
  [70, "#e2680c"],
  [90, "#e03131"],
  [100, "#c92a2a"],
];

/** Hex for a 0–100 value under the gradient mode, exactly as the statusline computes it. */
export function gradientColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  let i = 0;
  while (i < GRADIENT.length - 2 && p > GRADIENT[i + 1]![0]) i++;
  const [p0, c0] = GRADIENT[i]!;
  const [p1, c1] = GRADIENT[i + 1]!;
  const t = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
  const rgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const a = rgb(c0);
  const b = rgb(c1);
  return `#${a.map((v, k) => Math.round(v + (b[k]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
