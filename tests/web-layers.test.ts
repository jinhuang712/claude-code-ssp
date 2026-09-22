/**
 * The panel must save only what the user changed into the target layer (web/src/layers.ts).
 * Regression cover for: defaults frozen into the user file, and a project's theme leaking into the
 * global user config on a plain user-level save.
 */
import { describe, expect, test } from "bun:test";
import { applyEdits, jsonEqual } from "../web/src/layers";

const defaults = { version: 1, theme: "default", separator: " │ ", colorLevel: "auto", git: { enabled: true, cacheMs: 2000 }, lines: [{ left: [{ widget: "project.path" }] }] };

describe("applyEdits", () => {
  test("an empty user layer only gains the one setting that changed", () => {
    const before = structuredClone(defaults);
    const after = { ...structuredClone(defaults), separator: " · " };
    expect(applyEdits({}, before, after)).toEqual({ separator: " · " });
  });

  test("values that came from a project layer are not copied into the user layer", () => {
    // Effective = defaults ← user {} ← project {theme: nord}. The user only changes the separator.
    const before = { ...structuredClone(defaults), theme: "nord" };
    const after = { ...before, separator: " / " };
    const user = applyEdits({}, before, after);
    expect(user).toEqual({ separator: " / " });
    expect("theme" in user).toBe(false);
  });

  test("existing layer keys survive untouched", () => {
    const layer = { theme: "dracula", $schema: "x" };
    const before = { ...structuredClone(defaults), theme: "dracula" };
    const after = { ...before, colorLevel: "256" };
    expect(applyEdits(layer, before, after)).toEqual({ theme: "dracula", $schema: "x", colorLevel: "256" });
  });

  test("nested objects merge key by key; arrays replace wholesale", () => {
    const before = structuredClone(defaults);
    const after = { ...structuredClone(defaults), git: { enabled: false, cacheMs: 2000 }, lines: [{ right: [{ widget: "model.badge" }] }] };
    expect(applyEdits({ git: { cacheMs: 500 } }, before, after)).toEqual({ git: { cacheMs: 500, enabled: false }, lines: [{ right: [{ widget: "model.badge" }] }] });
  });

  test("a removed key is removed from the layer", () => {
    const before = { ...structuredClone(defaults), bar: { filled: "▰", empty: "▱" } };
    const after = structuredClone(defaults);
    expect(applyEdits({ bar: { filled: "▰", empty: "▱" }, theme: "nord" }, before, after)).toEqual({ theme: "nord" });
  });

  test("no change leaves the layer exactly as it was", () => {
    const layer = { theme: "nord" };
    expect(applyEdits(layer, defaults, structuredClone(defaults))).toEqual(layer);
  });
});

describe("jsonEqual", () => {
  test("ignores key order and undefined-valued keys", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1, d: undefined })).toBe(true);
    expect(jsonEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
  });
});
