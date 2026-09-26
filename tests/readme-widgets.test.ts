/**
 * The README's "Widgets" section is the catalogue people read before installing, so it must list
 * exactly what the panel's tray offers: every built-in widget by its panel name, minus the retired
 * ones (web/src/retired.ts). Adding, renaming or retiring a widget without updating the README
 * fails here.
 */
import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { RETIRED } from "../web/src/retired";

const WIDGETS_DIR = path.resolve(import.meta.dir, "../src/widgets");

/**
 * Built-in widget definitions, read from the widget modules themselves: the shared registry can't be
 * listed here, because another test file leaves a category-less plugin widget in it that
 * listWidgets() fails to sort (see tests/web-presets.test.ts). Same test as registerBuiltinWidgets.
 */
async function builtinWidgets(): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  for (const f of fs.readdirSync(WIDGETS_DIR).filter((f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "index.ts")) {
    const mod = (await import(path.join(WIDGETS_DIR, f))) as Record<string, unknown>;
    for (const v of Object.values(mod)) {
      const w = v as { id?: unknown; name?: unknown; render?: unknown } | null;
      if (w && typeof w.id === "string" && typeof w.name === "string" && typeof w.render === "function") out.push({ id: w.id, name: w.name });
    }
  }
  return out;
}

/** First-column names of the tables under `## Widgets`, up to the next `## ` heading. */
function readmeWidgetNames(): string[] {
  const readme = fs.readFileSync(path.resolve(import.meta.dir, "../README.md"), "utf8");
  const section = readme.split(/^## Widgets\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    // Table rows only, without the header row and the |---| divider.
    .filter((l) => l.startsWith("| ") && !l.startsWith("| Widget ") && !l.startsWith("|---"))
    .map((l) => l.split("|")[1]!.trim());
}

test("the README lists every widget the tray offers, by its panel name, and nothing else", async () => {
  const offered = (await builtinWidgets()).filter((w) => !RETIRED.has(w.id)).map((w) => w.name);
  expect(offered.length).toBeGreaterThan(30); // guards against the scan finding nothing
  expect(readmeWidgetNames().sort()).toEqual(offered.sort());
});
