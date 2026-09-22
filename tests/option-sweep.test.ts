/**
 * The option sweep, as a test: every built-in widget, every value of every option, every built-in
 * sample (+ one real git repository). It exists because a manual sweep found widgets that never
 * rendered (tokens.outputSpeed) and options that silently did nothing — this keeps it that way.
 *
 *  1. every widget renders on at least one sample;
 *  2. no value makes a widget throw or print junk (NaN, undefined, [object …]);
 *  3. every option changes the output on some sample, once its `x-requires` are met — an option
 *     that can never change anything is a bug (dead) or needs sample data (add it to a fixture).
 *
 * The only exceptions are options whose data can't come from a session sample; each says why.
 */
import { describe, expect, test } from "bun:test";
import { BASE_OPTIONS, builtinWidgets, plain, renderOne, requirementsOf, sampleContexts, valuesFor } from "./option-sweep";

/** Options the sweep can't exercise, with the reason. Keep this empty unless there is no way to. */
const EXCEPTIONS: Record<string, string> = {};

const contexts = await sampleContexts();
const widgets = builtinWidgets();
const JUNK = /NaN|undefined|Infinity|\[object /;

describe("option sweep", () => {
  test("every widget renders on at least one built-in sample", () => {
    const silent = widgets.filter((w) => !contexts.some((c) => renderOne({ widget: w.id, options: BASE_OPTIONS[w.id] }, c.ctx).raw !== "")).map((w) => w.id);
    expect(silent).toEqual([]);
  });

  test("no option value throws or prints junk", () => {
    const problems: string[] = [];
    for (const w of widgets) {
      for (const [name, schema] of Object.entries(w.schema.properties ?? {})) {
        for (const v of valuesFor(w.id, name, schema, w.defaults[name])) {
          const options = { ...BASE_OPTIONS[w.id], ...requirementsOf(schema), [name]: v };
          for (const c of contexts) {
            const r = renderOne({ widget: w.id, options }, c.ctx);
            if (r.errors.length) problems.push(`${w.id}.${name}=${JSON.stringify(v)} on ${c.id}: ${r.errors.join("; ")}`);
            else if (JUNK.test(plain(r.raw))) problems.push(`${w.id}.${name}=${JSON.stringify(v)} on ${c.id}: ${JSON.stringify(plain(r.raw))}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("every option changes the output on some sample (requirements met)", () => {
    const dead: string[] = [];
    for (const w of widgets) {
      for (const [name, schema] of Object.entries(w.schema.properties ?? {})) {
        const key = `${w.id}.${name}`;
        if (EXCEPTIONS[key]) continue;
        const base = { ...BASE_OPTIONS[w.id], ...requirementsOf(schema) };
        const moves = valuesFor(w.id, name, schema, w.defaults[name]).some((v) =>
          contexts.some((c) => renderOne({ widget: w.id, options: base }, c.ctx).raw !== renderOne({ widget: w.id, options: { ...base, [name]: v } }, c.ctx).raw),
        );
        if (!moves) dead.push(key);
      }
    }
    expect(dead).toEqual([]);
  });

  test("x-requires only names options the widget has", () => {
    const bad: string[] = [];
    for (const w of widgets)
      for (const [name, schema] of Object.entries(w.schema.properties ?? {}))
        for (const req of Object.keys(requirementsOf(schema))) if (!(req in (w.schema.properties ?? {}))) bad.push(`${w.id}.${name} requires unknown ${req}`);
    expect(bad).toEqual([]);
  });
});
