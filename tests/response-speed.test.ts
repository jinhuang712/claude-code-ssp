/**
 * tokens.outputSpeed is measured from the transcript (src/core/response-speed.ts). These cases pin
 * the rules: request start = preceding user entry, a response spans all its entries, short replies
 * and subagent entries are skipped, and a tail read that starts mid-file still works.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { lastResponseSpeed } from "../src/core/response-speed";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-speed-"));
const t0 = Date.parse("2026-09-23T10:00:00.000Z");
const at = (s: number) => new Date(t0 + s * 1000).toISOString();
const user = (s: number) => ({ type: "user", timestamp: at(s), message: { role: "user", content: "go" } });
const asst = (s: number, id: string, out: number, extra: Record<string, unknown> = {}) => ({ type: "assistant", timestamp: at(s), message: { id, role: "assistant", usage: { output_tokens: out } }, ...extra });
function transcript(name: string, entries: unknown[], padBefore = 0): string {
  const f = path.join(dir, `${name}.jsonl`);
  const pad = padBefore ? `${JSON.stringify({ type: "system", timestamp: at(0), content: "x".repeat(padBefore) })}\n` : "";
  fs.writeFileSync(f, pad + entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return f;
}

describe("lastResponseSpeed", () => {
  test("output tokens over request start → last entry of the response", () => {
    // 1000 tokens, request at t=10, blocks written at t=15 and t=20 → 1000 / 10 s.
    const f = transcript("basic", [user(10), asst(15, "m1", 1000), asst(20, "m1", 1000)]);
    const r = lastResponseSpeed(f)!;
    expect(r.outputTokens).toBe(1000);
    expect(r.durationMs).toBe(10_000);
    expect(r.tokensPerSecond).toBeCloseTo(100);
  });

  test("the latest long-enough response wins; short replies are skipped", () => {
    const f = transcript("short", [user(0), asst(10, "long", 800), user(11), asst(13, "short", 50)]);
    expect(lastResponseSpeed(f)!.outputTokens).toBe(800);
    expect(lastResponseSpeed(f, 10)!.outputTokens).toBe(50);
  });

  test("subagent (sidechain) entries don't count", () => {
    const f = transcript("side", [user(0), asst(10, "main", 500), user(12, ), asst(14, "sub", 900, { isSidechain: true })]);
    expect(lastResponseSpeed(f)!.outputTokens).toBe(500);
  });

  test("works when only the tail is read (file larger than the tail window)", () => {
    const f = transcript("big", [user(100), asst(104, "m", 400)], 400 * 1024);
    expect(lastResponseSpeed(f)!.tokensPerSecond).toBeCloseTo(100);
  });

  test("no transcript, no user entry, or no usage → null, never a throw", () => {
    expect(lastResponseSpeed(undefined)).toBeNull();
    expect(lastResponseSpeed(path.join(dir, "missing.jsonl"))).toBeNull();
    expect(lastResponseSpeed(transcript("nouser", [asst(5, "m", 900)]))).toBeNull();
    expect(lastResponseSpeed(transcript("garbage", ["{not json", user(0), { type: "assistant", timestamp: at(3), message: { id: "x" } }]))).toBeNull();
  });
});
