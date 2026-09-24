import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildContext } from "../src/core/context.ts";
import { render } from "../src/core/layout.ts";
import { listWidgets } from "../src/core/registry.ts";
import { ensureBuiltins, plainConfig, renderWidget } from "./helpers.ts";

/*
  The bundled fixtures are the web preview's sample sessions and the README's terminal demo, so each
  one must cover a real-world shape of Claude Code's stdin and render cleanly with every widget.
*/
const dir = path.resolve(import.meta.dir, "..", "src", "fixtures");
const fixtures = Object.fromEntries(
  fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]),
) as Record<string, Record<string, unknown>>;

describe("bundled fixtures", () => {
  test("the six scenarios from DESIGN.md exist next to basic, plus a routed (Bedrock) session", () => {
    expect(new Set(Object.keys(fixtures))).toEqual(new Set(["basic", "bedrock", "context-1m", "fresh-session", "no-rate-limits", "post-compact", "vim-mode", "worktree"]));
  });

  test("every fixture uses a fixture-* session id (so it is never listed as a live session)", () => {
    for (const [name, payload] of Object.entries(fixtures)) expect(`${name}: ${payload.session_id}`).toBe(`${name}: fixture-${name}`);
  });

  test("every builtin widget renders every fixture without errors, NaN or undefined", async () => {
    ensureBuiltins();
    // One context per fixture, one line per widget: building the context per widget is ~40× slower.
    const config = plainConfig(listWidgets().map((w) => ({ left: [{ widget: w.id }] })));
    for (const [name, payload] of Object.entries(fixtures)) {
      const ctx = await buildContext(structuredClone(payload) as never, config, { columns: 0, now: Date.now() });
      const out = render(config, ctx);
      expect({ name, errors: out.errors }).toEqual({ name, errors: [] });
      for (const line of out.lines) expect(`${name}: ${line}`).not.toMatch(/NaN|undefined|null/);
    }
  });
});

describe("fixture scenarios render what they are meant to show", () => {
  test("fresh session: zeros, not blanks", async () => {
    expect(await renderWidget(fixtures["fresh-session"], { widget: "context.value" })).toBe("ctx 0%");
    expect(await renderWidget(fixtures["fresh-session"], { widget: "cost.session" })).toBe("Cost $0.00");
  });

  test("post-compact null usage: the context reads 0% instead of breaking", async () => {
    expect(await renderWidget(fixtures["post-compact"], { widget: "context.bar" })).toContain("0%");
    expect(await renderWidget(fixtures["post-compact"], { widget: "tokens.current" })).toBe("");
  });

  test("1M context: the badge keeps Claude Code's own window suffix", async () => {
    expect(await renderWidget(fixtures["context-1m"], { widget: "model.badge" })).toBe("[Opus 5.5 (1M context) ◕ xhigh]");
    expect(await renderWidget(fixtures["context-1m"], { widget: "tokens.current" })).toBe("ctx 338k");
  });

  test("no rate_limits (API key / Bedrock): usage widgets stay hidden, cost still shows", async () => {
    expect(await renderWidget(fixtures["no-rate-limits"], { widget: "usage.windows" })).toBe("");
    expect(await renderWidget(fixtures["no-rate-limits"], { widget: "cost.session" })).toContain("$0.42");
  });

  test("worktree: worktree name and PR state", async () => {
    expect(await renderWidget(fixtures.worktree, { widget: "project.worktree" })).toContain("search-ranking");
    expect(await renderWidget(fixtures.worktree, { widget: "git.pr" })).toContain("#1287");
  });

  test("vim mode: mode, agent name and the fast-mode marker", async () => {
    expect(await renderWidget(fixtures["vim-mode"], { widget: "session.vimMode" })).toContain("NORMAL");
    expect(await renderWidget(fixtures["vim-mode"], { widget: "session.agent" })).toContain("shell-helper");
    expect(await renderWidget(fixtures["vim-mode"], { widget: "model.badge" })).toContain("⚡");
  });
});

// Fields the statusline docs list that had no widget or option until now, one test per addition.
describe("documented stdin fields that have their own widget or option", () => {
  test("session.id: the first 8 characters, or the whole id", async () => {
    expect(await renderWidget(fixtures.basic, { widget: "session.id" })).toBe("id fixture-");
    expect(await renderWidget(fixtures.basic, { widget: "session.id", options: { full: true } })).toBe("id fixture-basic");
  });

  test("context.over200k: a flag only while exceeds_200k_tokens is true", async () => {
    expect(await renderWidget(fixtures["context-1m"], { widget: "context.over200k" })).toBe("200k+");
    expect(await renderWidget(fixtures.basic, { widget: "context.over200k" })).toBe("");
  });
});
