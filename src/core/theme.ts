import type { ThemeDef } from "./types.js";

/*
  `fg` is "default" in every theme: plain values print in the terminal's own foreground colour
  (no SGR colour code at all). Hard-coded white — or a dark theme's pale hex — all but vanished on
  light terminals, and the statusline never paints its own background to compensate.
*/
const base = (name: string, t: Partial<ThemeDef["tokens"]>, bar?: ThemeDef["bar"]): ThemeDef => ({
  name,
  tokens: {
    fg: "default",
    muted: "gray",
    accent: "cyan",
    ok: "green",
    warn: "yellow",
    crit: "red",
    model: "cyan",
    project: "yellow",
    git: "magenta",
    usage: "brightBlue",
    context: "green",
    ...t,
  },
  bar: bar ?? { filled: "█", empty: "░" },
});

export const THEMES: Record<string, ThemeDef> = {
  default: base("default", {}),
  nord: base("nord", {
    muted: "#4c566a", accent: "#88c0d0", ok: "#a3be8c", warn: "#ebcb8b", crit: "#bf616a",
    model: "#81a1c1", project: "#ebcb8b", git: "#b48ead", usage: "#88c0d0", context: "#a3be8c",
  }),
  dracula: base("dracula", {
    muted: "#6272a4", accent: "#8be9fd", ok: "#50fa7b", warn: "#f1fa8c", crit: "#ff5555",
    model: "#bd93f9", project: "#ffb86c", git: "#ff79c6", usage: "#8be9fd", context: "#50fa7b",
  }),
  gruvbox: base("gruvbox", {
    muted: "#928374", accent: "#83a598", ok: "#b8bb26", warn: "#fabd2f", crit: "#fb4934",
    model: "#83a598", project: "#fabd2f", git: "#d3869b", usage: "#8ec07c", context: "#b8bb26",
  }),
  "tokyo-night": base("tokyo-night", {
    muted: "#565f89", accent: "#7dcfff", ok: "#9ece6a", warn: "#e0af68", crit: "#f7768e",
    model: "#7aa2f7", project: "#e0af68", git: "#bb9af7", usage: "#7dcfff", context: "#9ece6a",
  }),
  catppuccin: base("catppuccin", {
    muted: "#6c7086", accent: "#89dceb", ok: "#a6e3a1", warn: "#f9e2af", crit: "#f38ba8",
    model: "#89b4fa", project: "#fab387", git: "#cba6f7", usage: "#89dceb", context: "#a6e3a1",
  }),
  // Monochrome = the terminal's foreground everywhere; emphasis comes from bold (crit is bold) and bars.
  mono: base("mono", {
    muted: "gray", accent: "default", ok: "default", warn: "default", crit: "default",
    model: "default", project: "default", git: "default", usage: "default", context: "default",
  }, { filled: "#", empty: "-" }),
};

export function resolveTheme(theme: string | ThemeDef): ThemeDef {
  if (typeof theme !== "string") {
    const fallback = THEMES.default!;
    return { name: theme.name ?? "custom", tokens: { ...fallback.tokens, ...theme.tokens }, bar: theme.bar ?? fallback.bar };
  }
  return THEMES[theme] ?? THEMES.default!;
}

export function listThemes(): ThemeDef[] {
  return Object.values(THEMES);
}
