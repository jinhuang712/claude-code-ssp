/**
 * The gradient colour mode must stay readable on the terminals people actually use. The statusline
 * never paints a background, so every percentage has to clear 3:1 (WCAG's minimum for large text and
 * non-text marks like bar glyphs) against a light and a dark ground. The old stops started at pure
 * white, which made a 1% usage bar invisible on a light terminal.
 */
import { describe, expect, test } from "bun:test";
import { gradient } from "../src/core/api";

/** WCAG 2 relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// White (light terminals), Claude's slate (the preview's dark ground) and pure black.
const GROUNDS = { white: "#ffffff", slate: "#141413", black: "#000000" };

describe("gradient colour mode", () => {
  for (const [name, ground] of Object.entries(GROUNDS)) {
    test(`every percentage is at least 3:1 on ${name}`, () => {
      const worst = Array.from({ length: 101 }, (_, pct) => ({ pct, ratio: contrast(gradient(pct), ground) })).sort((a, b) => a.ratio - b.ratio)[0]!;
      expect(worst.ratio, `${worst.pct}% → ${gradient(worst.pct)} is only ${worst.ratio.toFixed(2)}:1 on ${ground}`).toBeGreaterThanOrEqual(3);
    });
  }

  test("still runs from cool to hot", () => {
    // Low usage reads blue-ish, high usage red: the red channel dominates only at the top end.
    const [r0, , b0] = [1, 3, 5].map((i) => parseInt(gradient(10).slice(i, i + 2), 16));
    const [r100, , b100] = [1, 3, 5].map((i) => parseInt(gradient(100).slice(i, i + 2), 16));
    expect(b0!).toBeGreaterThan(r0!);
    expect(r100!).toBeGreaterThan(b100!);
  });
});
