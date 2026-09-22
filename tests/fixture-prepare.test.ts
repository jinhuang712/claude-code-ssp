/**
 * Built-in samples get live-looking times and a real copy of their bundled transcript
 * (src/core/fixtures.ts), so transcript widgets can be previewed without a live session.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { prepareFixture } from "../src/core/fixtures";
import { renderWidget } from "./helpers";

const FIXTURE = path.resolve(import.meta.dir, "../src/fixtures/basic.json");
const payload = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

describe("prepareFixture", () => {
  test("a relative transcript becomes a real file with ISO timestamps relative to now", () => {
    const now = Date.now();
    const p = prepareFixture(payload, FIXTURE, now);
    expect(path.isAbsolute(p.transcript_path)).toBe(true);
    const lines = fs.readFileSync(p.transcript_path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const last = Date.parse(lines[lines.length - 1].timestamp);
    expect(Math.abs(last - (now - 30_000))).toBeLessThan(60_000); // written ≤ a minute ago at -30 s
  });

  test("zero time fields are filled; the input object is not mutated", () => {
    const before = JSON.stringify(payload);
    const p = prepareFixture(payload, FIXTURE);
    if (payload.rate_limits?.five_hour) expect(p.rate_limits.five_hour.resets_at).toBeGreaterThan(Date.now() / 1000);
    expect(JSON.stringify(payload)).toBe(before);
  });

  test("the transcript widgets render from the bundled sample", async () => {
    const p = prepareFixture(payload, FIXTURE);
    expect(await renderWidget(p, { widget: "activity.todos" })).toBe("Todos 1/3 → Write tests");
    expect(await renderWidget(p, { widget: "activity.agents" })).toBe("Agents ● Explore (haiku)");
    expect(await renderWidget(p, { widget: "activity.mcp" })).toBe("MCP github ⚠ linear");
    expect(await renderWidget(p, { widget: "tokens.outputSpeed" })).toBe("120 tok/s");
  });

  test("an absolute (live) transcript path is left alone", () => {
    const live = { ...payload, transcript_path: "/Users/you/.claude/projects/x/abc.jsonl" };
    expect(prepareFixture(live, FIXTURE).transcript_path).toBe("/Users/you/.claude/projects/x/abc.jsonl");
  });
});
