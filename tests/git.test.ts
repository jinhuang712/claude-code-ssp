import { beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGitStatus } from "../src/data/git.ts";
import { runGit as git } from "./helpers.ts";

/*
  getGitStatus now starts its git commands concurrently. These tests pin the observable result on a
  real throwaway repo so the parallel version reports exactly what the sequential one did.
*/
const root = path.join(process.env.SSP_TEST_ROOT!, "git-status");
const repo = path.join(root, "repo");
const upstream = path.join(root, "upstream.git");

beforeAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });
  git(root, "init", "--bare", "-q", upstream);
  git(repo, "init", "-q");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\ntwo\nthree\n");
  fs.writeFileSync(path.join(repo, "b.txt"), "keep\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "first");
  git(repo, "remote", "add", "origin", "git@github.com:acme/widgets.git");
  git(repo, "push", "-q", upstream, "main");
  git(repo, "fetch", "-q", upstream, "main:refs/remotes/origin/main");
  git(repo, "branch", "-q", "--set-upstream-to=origin/main");
  // One local commit ahead of upstream, then a dirty tree.
  fs.writeFileSync(path.join(repo, "c.txt"), "new file\n");
  git(repo, "add", "c.txt");
  git(repo, "commit", "-q", "-m", "second");
  fs.writeFileSync(path.join(repo, "a.txt"), "one\nTWO\nthree\nfour\n"); // +2 -1
  fs.rmSync(path.join(repo, "b.txt")); // -1
  fs.writeFileSync(path.join(repo, "untracked.txt"), "?\n");
});

describe("getGitStatus", () => {
  test("reports branch, dirty file stats, line diff, ahead/behind and the GitHub URL", async () => {
    const s = await getGitStatus(repo);
    expect(s).not.toBeNull();
    expect(s!.branch).toBe("main");
    expect(s!.isDirty).toBe(true);
    expect(s!.ahead).toBe(1);
    expect(s!.behind).toBe(0);
    expect(s!.fileStats).toMatchObject({ modified: 1, deleted: 1, untracked: 1, added: 0 });
    expect(s!.lineDiff).toEqual({ added: 2, deleted: 2 });
    expect(s!.branchUrl).toBe("https://github.com/acme/widgets/tree/main");
  });

  test("clean tree: not dirty, no stats, no line diff", async () => {
    const clean = path.join(root, "clean");
    fs.mkdirSync(clean, { recursive: true });
    git(clean, "init", "-q");
    fs.writeFileSync(path.join(clean, "x"), "x\n");
    git(clean, "add", ".");
    git(clean, "commit", "-q", "-m", "x");
    const s = await getGitStatus(clean);
    expect(s).toMatchObject({ branch: "main", isDirty: false, ahead: 0, behind: 0 });
    expect(s!.fileStats).toBeUndefined();
    expect(s!.lineDiff).toBeUndefined();
  });

  test("outside a repo returns null", async () => {
    const plain = path.join(root, "plain");
    fs.mkdirSync(plain, { recursive: true });
    expect(await getGitStatus(plain)).toBeNull();
  });
});
