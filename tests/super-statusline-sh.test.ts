/**
 * scripts/super-statusline.sh (the slash command's helper) finding Bun. A Claude Code session
 * started before Bun was installed has a PATH without ~/.bun/bin — install.sh can install Bun
 * mid-session — so the script also looks in Bun's default place before giving up.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
let home = "";

beforeAll(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ssl-sh-")));
});
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

/** render-test: renders the bundled sample session — cheap, and it needs a working bun. */
function renderTest(env: Record<string, string>) {
  const r = Bun.spawnSync({ cmd: ["/bin/bash", "scripts/super-statusline.sh", "render-test"], cwd: ROOT, env: { PATH: "/usr/bin:/bin", COLUMNS: "80", ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

test("bun off PATH but in ~/.bun/bin is found there", () => {
  fs.mkdirSync(path.join(home, ".bun", "bin"), { recursive: true });
  fs.symlinkSync(process.execPath, path.join(home, ".bun", "bin", "bun"));
  const r = renderTest({ HOME: home });
  expect(r.code).toBe(0);
  expect(r.out).toContain("webapp");
});

test("no bun anywhere says where to get it", () => {
  const r = renderTest({ HOME: path.join(home, "nowhere") });
  expect(r.code).toBe(1);
  expect(r.out).toContain("bun not found");
});
