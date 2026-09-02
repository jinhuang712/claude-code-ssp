import { describe, expect, test } from "bun:test";
import { stripAnsi, truncateVisual, visualWidth } from "../src/core/ansi.ts";
import { layoutLine, render } from "../src/core/layout.ts";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { registerWidget, _resetRegistry } from "../src/core/registry.ts";
import { defineWidget, type Ctx } from "../src/core/types.ts";

const z = (text: string) => ({ text, width: visualWidth(text) });

describe("visualWidth", () => {
  test("ascii, cjk, emoji, ansi", () => {
    expect(visualWidth("abc")).toBe(3);
    expect(visualWidth("中文")).toBe(4);
    expect(visualWidth("\x1b[32mok\x1b[0m")).toBe(2);
    expect(visualWidth("\x1b]8;;http://x\x07link\x1b]8;;\x07")).toBe(4);
    expect(stripAnsi("\x1b[1;31mX\x1b[0m")).toBe("X");
  });
  test("truncate keeps cells within budget", () => {
    expect(truncateVisual("abcdefgh", 5)).toBe("abcd…");
    expect(visualWidth(truncateVisual("中文字符串", 5))).toBeLessThanOrEqual(5);
  });
});

describe("layoutLine", () => {
  test("right zone is anchored to the last column", () => {
    const [row] = layoutLine({ left: z("L"), center: z(""), right: z("RR") }, 20);
    expect(visualWidth(row!)).toBe(20);
    expect(row!.endsWith("RR")).toBe(true);
    expect(row!.startsWith("L")).toBe(true);
  });
  test("center floats between left and right", () => {
    const [row] = layoutLine({ left: z("LL"), center: z("CC"), right: z("RR") }, 20);
    expect(visualWidth(row!)).toBe(20);
    expect(row!.indexOf("CC")).toBe(9);
  });
  test("wrap policy moves right zone to its own right-aligned row", () => {
    const rows = layoutLine({ left: z("x".repeat(15)), center: z(""), right: z("y".repeat(10)) }, 20, "wrap");
    expect(rows).toHaveLength(2);
    expect(rows[1]!.endsWith("y".repeat(10))).toBe(true);
    expect(visualWidth(rows[1]!)).toBe(20);
  });
  test("drop-right policy hides the right zone", () => {
    const rows = layoutLine({ left: z("x".repeat(15)), center: z(""), right: z("y".repeat(10)) }, 20, "drop-right");
    expect(rows).toEqual(["x".repeat(15)]);
  });
  test("unknown width falls back to plain join", () => {
    expect(layoutLine({ left: z("a"), center: z(""), right: z("b") }, 0)).toEqual(["a b"]);
  });
});

describe("render", () => {
  test("unknown and throwing widgets never blank the line", () => {
    _resetRegistry();
    registerWidget(defineWidget({ id: "boom", name: "boom", description: "", category: "misc", schema: {}, defaults: {}, render: () => { throw new Error("nope"); } }));
    registerWidget(defineWidget({ id: "ok", name: "ok", description: "", category: "misc", schema: {}, defaults: {}, render: () => "fine" }));
    const ctx = { columns: 40, now: 0 } as unknown as Omit<Ctx, "theme">;
    const out = render({ ...DEFAULT_CONFIG, colorLevel: "none", lines: [{ left: [{ widget: "ok" }, { widget: "boom" }, { widget: "missing" }] }] }, ctx);
    expect(out.lines[0]).toBe("fine │ ⚠ boom │ ⚠ missing");
    expect(out.errors.map((e) => e.widget)).toEqual(["boom", "missing"]);
  });
});
