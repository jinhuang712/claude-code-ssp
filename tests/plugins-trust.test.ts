import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadEffectiveConfig } from "../src/core/config.ts";
import { isTrustedProject, loadPlugins, projectWidgetsDir } from "../src/core/plugins.ts";
import { enterSandbox, type Sandbox } from "./server-sandbox.ts";

let sb: Sandbox;
let repo: string;
let marker: string;

/** A repo that ships a widget whose mere import leaves a file behind — the attack we must not allow. */
function plantHostileRepo(root: string): { repo: string; marker: string } {
  const repo = path.join(root, "cloned-repo");
  const marker = path.join(root, "PWNED.txt");
  fs.mkdirSync(projectWidgetsDir(repo), { recursive: true });
  fs.writeFileSync(
    path.join(projectWidgetsDir(repo), "evil.js"),
    `import * as fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "ran"); export default { id: "evil.widget", render: () => "x" };`,
  );
  return { repo, marker };
}

beforeAll(() => {
  sb = enterSandbox();
  ({ repo, marker } = plantHostileRepo(sb.root));
});
afterAll(() => sb.restore());

describe("isTrustedProject", () => {
  test("exact dir and subdirs are trusted; siblings with a shared prefix are not", () => {
    const base = path.join(sb.root, "work");
    fs.mkdirSync(path.join(base, "app", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(sb.root, "work-evil"), { recursive: true });
    expect(isTrustedProject(base, [base])).toBe(true);
    expect(isTrustedProject(path.join(base, "app", "pkg"), [base])).toBe(true);
    expect(isTrustedProject(path.join(sb.root, "work-evil"), [base])).toBe(false);
    expect(isTrustedProject(base, [])).toBe(false);
  });
});

describe("project widgets", () => {
  test("an untrusted repo's widgets are skipped (and reported), never imported", async () => {
    const { config } = loadEffectiveConfig(repo);
    const report = await loadPlugins(config, repo);
    expect(fs.existsSync(marker)).toBe(false);
    expect(report.loaded).toEqual([]);
    expect(report.skipped.map((s) => s.dir)).toEqual([projectWidgetsDir(repo)]);
  });

  test("a repo can't trust itself or add plugin dirs through its project config", async () => {
    fs.writeFileSync(
      path.join(repo, ".claude", "claude-code-ssp.json"),
      JSON.stringify({ plugins: { trustedProjects: [repo], dirs: [projectWidgetsDir(repo)] }, separator: " ~ " }),
    );
    const { config } = loadEffectiveConfig(repo);
    expect(config.plugins).toEqual({ dirs: [], trustedProjects: [] });
    expect(config.separator).toBe(" ~ "); // the rest of the project layer still applies
    await loadPlugins(config, repo);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("once the user trusts the project, its widgets load", async () => {
    fs.mkdirSync(path.dirname(sb.userConfig), { recursive: true });
    fs.writeFileSync(sb.userConfig, JSON.stringify({ plugins: { trustedProjects: [repo] } }));
    const { config } = loadEffectiveConfig(repo);
    const report = await loadPlugins(config, repo);
    expect(report.skipped).toEqual([]);
    expect(report.loaded[0]?.ids).toEqual(["evil.widget"]);
    expect(fs.existsSync(marker)).toBe(true);
  });
});
