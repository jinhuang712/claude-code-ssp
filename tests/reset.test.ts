import { beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { listLiveSamples, samplesDir } from "../src/core/capture.ts";
import { resetsDir } from "../src/core/reset.ts";

/*
  /ssp:reset must zero the counters of the Claude session that ran it. Before, it picked "the
  latest captured sample", which was wrong with several sessions open and — because fixture renders
  were captured too — could even pick the README's fixture instead of any real session.
*/
const ROOT = path.resolve(import.meta.dir, "..");

function writeSample(sessionId: string, capturedAt: number, costUsd: number): void {
  const dir = samplesDir();
  fs.mkdirSync(dir, { recursive: true });
  const payload = { session_id: sessionId, transcript_path: "/nonexistent.jsonl", workspace: { current_dir: "/tmp/p" }, cost: { total_cost_usd: costUsd } };
  fs.writeFileSync(path.join(dir, `${sessionId}.json`), JSON.stringify({ capturedAt, payload }));
}

function run(cmd: string[], env: Record<string, string | undefined> = {}) {
  const r = Bun.spawnSync({ cmd, cwd: ROOT, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

const baselineExists = (id: string) => fs.existsSync(path.join(resetsDir(), `${id}.json`));

beforeEach(() => {
  fs.rmSync(samplesDir(), { recursive: true, force: true });
  fs.rmSync(resetsDir(), { recursive: true, force: true });
  const now = Date.now();
  writeSample("session-a", now - 60_000, 1);
  writeSample("session-b", now - 30_000, 2);
  // A leftover from older versions that captured fixture renders; newest of all.
  writeSample("fixture-basic", now, 3);
});

describe("live samples", () => {
  test("fixture-* leftovers are not listed as live sessions", () => {
    expect(listLiveSamples().map((s) => s.id)).toEqual(["session-b", "session-a"]);
  });

  test("render --fixture never captures a sample", () => {
    fs.rmSync(samplesDir(), { recursive: true, force: true });
    const r = run(["bun", "src/cli/main.ts", "render", "--fixture", "src/fixtures/basic.json"]);
    expect(r.code).toBe(0);
    expect(fs.existsSync(samplesDir()) ? fs.readdirSync(samplesDir()) : []).toEqual([]);
  });
});

describe("ssp.sh reset", () => {
  test("targets the Claude session that ran it (CLAUDE_CODE_SESSION_ID)", () => {
    const r = run(["bash", "scripts/ssp.sh", "reset"], { CLAUDE_CODE_SESSION_ID: "session-a" });
    expect(r.out).toContain("session session-a");
    expect(baselineExists("session-a")).toBe(true);
    expect(baselineExists("session-b")).toBe(false);
  });

  test("without a session id it falls back to the most recent real session, never a fixture", () => {
    const r = run(["bash", "scripts/ssp.sh", "reset"], { CLAUDE_CODE_SESSION_ID: undefined });
    expect(r.out).toContain("session session-b");
    expect(baselineExists("session-b")).toBe(true);
    expect(baselineExists("fixture-basic")).toBe(false);
  });

  test("--undo clears the baseline of the named session only", () => {
    run(["bash", "scripts/ssp.sh", "reset"], { CLAUDE_CODE_SESSION_ID: "session-a" });
    run(["bash", "scripts/ssp.sh", "reset"], { CLAUDE_CODE_SESSION_ID: "session-b" });
    const r = run(["bash", "scripts/ssp.sh", "reset", "--undo"], { CLAUDE_CODE_SESSION_ID: "session-a" });
    expect(r.out).toContain("session-a");
    expect(baselineExists("session-a")).toBe(false);
    expect(baselineExists("session-b")).toBe(true);
  });
});
