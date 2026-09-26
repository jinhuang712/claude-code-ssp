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
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import type { JsonSchema } from "../src/core/types.ts";
import { BASE_OPTIONS, builtinWidgets, configRequirementsOf, plain, renderOne, requirementsOf, sampleContexts, valuesFor } from "./option-sweep";

/** The values of each top-level config key an option can require (x-requires-config). */
const CONFIG_ENUMS: Record<string, unknown[]> = { colorMode: ["thresholds", "gradient"] };

/** Options the sweep can't exercise, with the reason. Keep this empty unless there is no way to. */
const EXCEPTIONS: Record<string, string> = {};

/** Option × sibling-value pairs the samples can't show working, for the x-requires completeness test, with the reason. */
const UNREACHABLE: Record<string, string> = {
  // hideZero applies to both sources. With source=worktree the widget is hidden outright without a
  // repo, and the one real repo the sweep uses always has an uncommitted diff — so no sample has
  // a clean worktree for hideZero to hide.
  "git.linesChanged.hideZero@source": "no sample has a git worktree with zero uncommitted lines",
};

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

  /** Does changing `name` move the output on some sample, starting from `base`? */
  const moves = (w: (typeof widgets)[number], name: string, schema: JsonSchema, base: Record<string, unknown>) =>
    valuesFor(w.id, name, schema, w.defaults[name]).some((v) =>
      contexts.some((c) => renderOne({ widget: w.id, options: base }, c.ctx).raw !== renderOne({ widget: w.id, options: { ...base, [name]: v } }, c.ctx).raw),
    );

  // The panel dims an option whose x-requires is unmet and says it has no effect. That must be true.
  test("an option never changes the output while its x-requires is unmet", () => {
    const lying: string[] = [];
    for (const w of widgets) {
      const props = w.schema.properties ?? {};
      for (const [name, schema] of Object.entries(props)) {
        for (const [sib, want] of Object.entries(requirementsOf(schema))) {
          const others = typeof want === "boolean" ? [!want] : (props[sib]?.enum ?? []).filter((v) => v !== want);
          for (const other of others) if (moves(w, name, schema, { ...BASE_OPTIONS[w.id], [sib]: other })) lying.push(`${w.id}.${name} changes the output with ${sib}=${JSON.stringify(other)}`);
        }
      }
    }
    expect(lying).toEqual([]);
  });

  // The converse: an option that does nothing under one value of a sibling enum (but something under
  // another) must say so, or the panel offers a control that silently does nothing. This caught
  // warnAt under the gradient colour mode, back when that was a sibling option (now x-requires-config, below).
  test("an option that only works under some value of a sibling enum declares x-requires", () => {
    const undeclared: string[] = [];
    for (const w of widgets) {
      const props = w.schema.properties ?? {};
      for (const [name, schema] of Object.entries(props)) {
        if (EXCEPTIONS[`${w.id}.${name}`]) continue;
        const declared = requirementsOf(schema);
        for (const [sib, sibSchema] of Object.entries(props)) {
          if (sib === name || !sibSchema.enum || sib in declared || UNREACHABLE[`${w.id}.${name}@${sib}`]) continue;
          const byValue = sibSchema.enum.map((v) => moves(w, name, schema, { ...BASE_OPTIONS[w.id], ...declared, [sib]: v }));
          if (byValue.includes(true) && byValue.includes(false)) {
            const dead = sibSchema.enum.filter((_, i) => !byValue[i]).map((v) => JSON.stringify(v));
            undeclared.push(`${w.id}.${name} does nothing with ${sib}=${dead.join("|")} but has no x-requires on ${sib}`);
          }
        }
      }
    }
    expect(undeclared).toEqual([]);
  });

  // The same promise for requirements on the config rather than on a sibling (x-requires-config):
  // warnAt is dimmed under the gradient, so it must really do nothing there.
  test("an option never changes the output while its x-requires-config is unmet", () => {
    const lying: string[] = [];
    for (const w of widgets) {
      for (const [name, schema] of Object.entries(w.schema.properties ?? {})) {
        for (const [key, want] of Object.entries(configRequirementsOf(schema))) {
          for (const other of (CONFIG_ENUMS[key] ?? []).filter((v) => v !== want)) {
            const base = { ...BASE_OPTIONS[w.id], ...requirementsOf(schema) };
            const cfg = { [key]: other };
            const moved = valuesFor(w.id, name, schema, w.defaults[name]).some((v) =>
              contexts.some((c) => renderOne({ widget: w.id, options: base }, c.ctx, cfg).raw !== renderOne({ widget: w.id, options: { ...base, [name]: v } }, c.ctx, cfg).raw),
            );
            if (moved) lying.push(`${w.id}.${name} changes the output with ${key}=${JSON.stringify(other)}`);
          }
        }
      }
    }
    expect(lying).toEqual([]);
  });

  test("x-requires-config only names config keys whose values the sweep knows", () => {
    const bad: string[] = [];
    for (const w of widgets)
      for (const [name, schema] of Object.entries(w.schema.properties ?? {}))
        for (const key of Object.keys(configRequirementsOf(schema))) if (!(key in DEFAULT_CONFIG) || !CONFIG_ENUMS[key]) bad.push(`${w.id}.${name} requires config ${key}`);
    expect(bad).toEqual([]);
  });

  // The Style panel's "Progress bar mode" is one config key; every widget with thresholds must follow it.
  test("the config's colorMode reaches every percentage widget", () => {
    const deaf = widgets
      .filter((w) => "warnAt" in (w.schema.properties ?? {}))
      .filter((w) => {
        const inst = { widget: w.id, options: { ...BASE_OPTIONS[w.id] } };
        return !contexts.some((c) => renderOne(inst, c.ctx, { colorMode: "thresholds" }).raw !== renderOne(inst, c.ctx, { colorMode: "gradient" }).raw);
      })
      .map((w) => w.id);
    expect(deaf).toEqual([]);
  });

  test("x-requires only names options the widget has", () => {
    const bad: string[] = [];
    for (const w of widgets)
      for (const [name, schema] of Object.entries(w.schema.properties ?? {}))
        for (const req of Object.keys(requirementsOf(schema))) if (!(req in (w.schema.properties ?? {}))) bad.push(`${w.id}.${name} requires unknown ${req}`);
    expect(bad).toEqual([]);
  });
});
