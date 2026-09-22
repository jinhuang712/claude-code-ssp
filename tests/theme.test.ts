/**
 * Plain values must print in the terminal's own foreground in every theme. A hard-coded "white"
 * (or a dark theme's pale hex) made values like "57%" all but invisible on light terminals.
 */
import { describe, expect, test } from "bun:test";
import { resolveColor, styleOpen } from "../src/core/ansi";
import { listThemes } from "../src/core/theme";

describe("theme fg", () => {
  for (const theme of listThemes()) {
    test(`${theme.name}: fg emits no colour code at any colour level`, () => {
      expect(resolveColor("fg", theme)).toBeNull();
      for (const level of ["truecolor", "256", "16"] as const) expect(styleOpen({ fg: "fg" }, theme, level)).toBe("");
      // Bold still applies without forcing a colour.
      expect(styleOpen({ fg: "fg", bold: true }, theme, "truecolor")).toBe("\x1b[1m");
    });
  }

  test('"default" is the terminal colour, not an unknown value', () => {
    const theme = listThemes()[0]!;
    expect(resolveColor("default", theme)).toBeNull();
    expect(resolveColor("red", theme)).not.toBeNull();
  });

  test("mono uses no colours except muted", () => {
    const mono = listThemes().find((t) => t.name === "mono")!;
    const coloured = Object.entries(mono.tokens).filter(([k]) => k !== "muted" && resolveColor(k, mono) !== null);
    expect(coloured).toEqual([]);
  });
});
