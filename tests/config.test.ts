import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, mergeConfig, normalizeConfig } from "../src/core/config.ts";

describe("mergeConfig", () => {
  test("objects deep-merge, arrays replace", () => {
    const out = mergeConfig({ a: { x: 1, y: 2 }, list: [1, 2, 3] }, { a: { y: 9 }, list: [7] });
    expect(out).toEqual({ a: { x: 1, y: 9 }, list: [7] });
  });
  test("undefined never overwrites", () => {
    expect(mergeConfig({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });
});

describe("normalizeConfig", () => {
  test("fills defaults and drops junk widgets", () => {
    const c = normalizeConfig({ lines: [{ left: [{ widget: "model.badge" }, { nope: 1 } as never, "str" as never] }] });
    expect(c.lines[0]!.left).toEqual([{ widget: "model.badge" }]);
    expect(c.lines[0]!.right).toEqual([]);
    expect(c.separator).toBe(DEFAULT_CONFIG.separator);
    expect(c.columnsOffset).toBe(4);
  });
  test("rejects bad enum values", () => {
    expect(normalizeConfig({ colorLevel: "rainbow" as never }).colorLevel).toBe("auto");
    expect(normalizeConfig({ columnsOffset: -5 }).columnsOffset).toBe(0);
  });
});
