import { beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import type { FooterConfig } from "../src/core/types.ts";
import { readVcsCache, refreshVcsCache, resolveVcsStatus, vcsCachePath, vcsMarkers } from "../src/core/vcs-cache.ts";
import type { GitStatus } from "../src/data/git.ts";
import { runGit as git } from "./helpers.ts";

const root = path.join(process.env.SSP_TEST_ROOT!, "vcs-cache");
const cfg = (cacheMs: number): FooterConfig => ({ ...DEFAULT_CONFIG, git: { enabled: true, cacheMs } });

function freshRepo(name: string): string {
  const repo = path.join(root, name);
  fs.rmSync(repo, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q");
  fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  fs.rmSync(vcsCachePath(repo), { force: true });
  fs.rmSync(`${vcsCachePath(repo)}.lock`, { force: true });
  return repo;
}

beforeEach(() => fs.mkdirSync(root, { recursive: true }));

describe("git cache honours cacheMs", () => {
  test("an unstaged edit shows up once cacheMs has passed (no hidden 30 s floor)", async () => {
    const repo = freshRepo("ttl");
    const t0 = Date.now();
    expect((await resolveVcsStatus(repo, cfg(1000), t0))!.isDirty).toBe(false);
    // Untracked files and unstaged edits touch neither HEAD nor the index: only the TTL catches them.
    fs.writeFileSync(path.join(repo, "new.txt"), "x\n");
    expect((await resolveVcsStatus(repo, cfg(1000), t0 + 999))!.isDirty).toBe(false); // still cached
    // Regression: the old cache trusted unchanged markers for max(cacheMs, 30 s) and stayed clean here.
    expect((await resolveVcsStatus(repo, cfg(1000), t0 + 1001))!.isDirty).toBe(true);
  });

  test("a commit invalidates the cache immediately, even within cacheMs", async () => {
    const repo = freshRepo("commit");
    fs.writeFileSync(path.join(repo, "a.txt"), "changed\n");
    const t0 = Date.now();
    expect((await resolveVcsStatus(repo, cfg(60_000), t0))!.isDirty).toBe(true);
    git(repo, "commit", "-q", "-am", "second");
    // Regression: the old cache returned the pre-commit dirty status for the rest of cacheMs.
    expect((await resolveVcsStatus(repo, cfg(60_000), t0 + 1))!.isDirty).toBe(false);
  });

  test("cacheMs 0 always recomputes", async () => {
    const repo = freshRepo("zero");
    let calls = 0;
    const compute = async () => (calls++, { branch: "main", isDirty: false, ahead: 0, behind: 0 } satisfies GitStatus);
    await resolveVcsStatus(repo, cfg(0), Date.now(), { compute });
    await resolveVcsStatus(repo, cfg(0), Date.now(), { compute });
    expect(calls).toBe(2);
  });
});

describe("render deadline", () => {
  const slow = (status: GitStatus, ms: number) => () => new Promise<GitStatus>((r) => setTimeout(() => r(status), ms));
  const oldStatus: GitStatus = { branch: "old", isDirty: false, ahead: 0, behind: 0 };
  const newStatus: GitStatus = { branch: "new", isDirty: true, ahead: 0, behind: 0 };

  test("a late status falls back to the last known one and schedules a background refresh", async () => {
    const repo = freshRepo("late");
    await resolveVcsStatus(repo, cfg(0), Date.now(), { compute: async () => oldStatus });
    const refreshed: string[] = [];
    const started = performance.now();
    const s = await resolveVcsStatus(repo, cfg(0), Date.now(), { deadlineMs: 50, compute: slow(newStatus, 500), refreshInBackground: (cwd) => refreshed.push(cwd) });
    expect(performance.now() - started).toBeLessThan(300);
    expect(s).toEqual(oldStatus);
    expect(refreshed).toEqual([repo]);
  });

  test("with nothing cached yet a late status renders nothing rather than waiting", async () => {
    const repo = freshRepo("late-empty");
    const s = await resolveVcsStatus(repo, cfg(0), Date.now(), { deadlineMs: 50, compute: slow(newStatus, 500), refreshInBackground: () => {} });
    expect(s).toBeNull();
  });

  test("the detached helper really fills the cache for the next render", async () => {
    const repo = freshRepo("detached");
    fs.writeFileSync(path.join(repo, "dirty.txt"), "x\n");
    // Force a deadline miss so the real spawnDetachedRefresh path runs.
    await resolveVcsStatus(repo, cfg(0), Date.now(), { deadlineMs: 1, compute: slow(newStatus, 2000) });
    let entry = readVcsCache(repo);
    for (let i = 0; i < 60 && !entry?.status; i++) {
      await Bun.sleep(50);
      entry = readVcsCache(repo);
    }
    expect(entry?.status?.branch).toBe("main");
    expect(entry?.status?.isDirty).toBe(true);
    expect(fs.existsSync(`${vcsCachePath(repo)}.lock`)).toBe(false);
  });

  test("refreshVcsCache computes and stores a status", async () => {
    const repo = freshRepo("refresh");
    const s = await refreshVcsCache(repo);
    expect(s?.branch).toBe("main");
    expect(readVcsCache(repo)?.status?.branch).toBe("main");
  });
});

describe("jj status is cached the same way", () => {
  test("recomputed only when the op heads change or cacheMs passes", async () => {
    const repo = path.join(root, "jj");
    fs.rmSync(repo, { recursive: true, force: true });
    const heads = path.join(repo, ".jj", "repo", "op_heads", "heads");
    fs.mkdirSync(heads, { recursive: true });
    fs.rmSync(vcsCachePath(repo), { force: true });
    expect(vcsMarkers(repo)?.vcs).toBe("jj");

    let calls = 0;
    const compute = async () => (calls++, { branch: "@", isDirty: false, ahead: 0, behind: 0, vcs: "jj" } satisfies GitStatus);
    const t0 = Date.now();
    await resolveVcsStatus(repo, cfg(5000), t0, { compute });
    await resolveVcsStatus(repo, cfg(5000), t0 + 10, { compute });
    expect(calls).toBe(1); // before: jj ran on every render
    // A new jj operation writes a new op head.
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(heads, later, later);
    await resolveVcsStatus(repo, cfg(5000), t0 + 20, { compute });
    expect(calls).toBe(2);
  });
});
