/**
 * The layout presets (web/src/store.ts) are plain data the panel copies into a config. A widget id
 * or option with a typo would not fail anywhere: the widget would render ⚠ or the option would be
 * ignored. This checks every preset instance against the built-in widgets' schemas.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { getWidget } from "../src/core/registry.ts";
import type { JsonSchema } from "../src/core/types.ts";
import { PRESETS } from "../web/src/store";
import { ensureBuiltins, renderWidget } from "./helpers.ts";

// Looked up one by one rather than listed: test files share one registry, and a plugin test leaves
// a widget without a category in it, which listWidgets() can't sort.
ensureBuiltins();
const byId = { get: (id: string) => getWidget(id) };

/** Whether `value` fits a (flat) option schema: its enum, or else its type. */
function fits(schema: JsonSchema, value: unknown): boolean {
  if (Array.isArray(schema.enum)) return schema.enum.includes(value);
  if (schema.type === "integer") return Number.isInteger(value);
  if (schema.type) return typeof value === schema.type;
  return true;
}

describe("layout presets", () => {
  test("every preset instance names a built-in widget and only its real options, with valid values", () => {
    const problems: string[] = [];
    for (const [id, preset] of Object.entries(PRESETS)) {
      preset.lines.forEach((line, n) => {
        for (const zone of ["left", "center", "right"] as const) {
          for (const inst of line[zone] ?? []) {
            const where = `${id} line ${n + 1} ${zone} ${inst.widget}`;
            const w = byId.get(inst.widget);
            if (!w) {
              problems.push(`${where}: no such widget`);
              continue;
            }
            const props = (w.schema.properties ?? {}) as Record<string, JsonSchema>;
            for (const [key, value] of Object.entries(inst.options ?? {})) {
              if (!props[key]) problems.push(`${where}: unknown option ${key}`);
              else if (!fits(props[key], value)) problems.push(`${where}: ${key}=${JSON.stringify(value)} is not valid`);
            }
            for (const key of Object.keys(inst.style ?? {})) {
              if (!["fg", "bg", "bold", "dim", "italic", "underline"].includes(key)) problems.push(`${where}: unknown style ${key}`);
            }
          }
        }
      });
    }
    expect(problems).toEqual([]);
  });

  // Minimal used context.value, which the tray no longer offers; its replacement must not change
  // what the line shows.
  test("Minimal's context item prints what context.value printed, on every bundled sample", async () => {
    const inst = PRESETS.minimal.lines[0]!.right!.find((w) => w.widget === "context.bar")!;
    const dir = path.resolve(import.meta.dir, "..", "src", "fixtures");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const payload = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      expect(`${f}: ${await renderWidget(payload, inst)}`).toBe(`${f}: ${await renderWidget(payload, { widget: "context.value" })}`);
    }
  });
});
