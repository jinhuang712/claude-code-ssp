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
