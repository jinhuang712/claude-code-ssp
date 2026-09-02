import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import { buildContext } from "../src/core/context.ts";
import { render } from "../src/core/layout.ts";
import { registerBuiltinWidgets } from "../src/widgets/index.ts";
import fixture from "../src/fixtures/basic.json";

describe("render budget", () => {
  test("default config renders the fixture well under the 300ms statusline debounce", async () => {
    registerBuiltinWidgets();
    const stdin = structuredClone(fixture) as never;
    const ctx = await buildContext(stdin, { ...DEFAULT_CONFIG, git: { enabled: false, cacheMs: 0 } }, { columns: 120, now: Date.now() });
    // warm-up
    render(DEFAULT_CONFIG, ctx);
    const started = performance.now();
    const out = render(DEFAULT_CONFIG, ctx);
    const ms = performance.now() - started;
    expect(out.errors).toEqual([]);
    expect(out.lines.length).toBeGreaterThanOrEqual(2);
    expect(ms).toBeLessThan(20);
  });

  test("every builtin widget renders without throwing on the fixture and on an empty payload", async () => {
    registerBuiltinWidgets();
    const { listWidgets } = await import("../src/core/registry.ts");
    const all = listWidgets().map((w) => ({ widget: w.id }));
    for (const payload of [structuredClone(fixture), {}]) {
      const ctx = await buildContext(payload as never, { ...DEFAULT_CONFIG, git: { enabled: false, cacheMs: 0 } }, { columns: 200, now: Date.now() });
      const out = render({ ...DEFAULT_CONFIG, lines: [{ left: all }] }, ctx);
      expect(out.errors).toEqual([]);
    }
  });
});
