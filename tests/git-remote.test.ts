/**
 * git.repo falls back to the origin remote in .git/config when Claude Code sends no workspace.repo
 * (src/core/git-remote.ts): URL forms, linked worktrees, and the widget end to end.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { originRepo, parseRemoteUrl } from "../src/core/git-remote";
import { renderWidget, runGit } from "./helpers";

describe("parseRemoteUrl", () => {
  test("https, scp-style and ssh:// forms", () => {
    expect(parseRemoteUrl("https://github.com/acme/webapp.git")).toEqual({ host: "github.com", owner: "acme", name: "webapp" });
    expect(parseRemoteUrl("git@github.com:acme/webapp.git")).toEqual({ host: "github.com", owner: "acme", name: "webapp" });
    expect(parseRemoteUrl("ssh://git@gitlab.example.com:2222/group/sub/app")).toEqual({ host: "gitlab.example.com", owner: "group/sub", name: "app" });
  });
  test("things that aren't a hosted repo → null", () => {
    expect(parseRemoteUrl("/srv/git/app.git")).toBeNull();
    expect(parseRemoteUrl("https://github.com/only-owner")).toBeNull();
    expect(parseRemoteUrl("not a url")).toBeNull();
  });
});

describe("originRepo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-remote-"));
  const repo = path.join(root, "repo");
  fs.mkdirSync(path.join(repo, "src", "deep"), { recursive: true });
  runGit(repo, "init", "-q");
  runGit(repo, "remote", "add", "origin", "git@github.com:acme/webapp.git");
  fs.writeFileSync(path.join(repo, "a.txt"), "a");
  runGit(repo, "add", ".");
  runGit(repo, "commit", "-qm", "init");

  test("found from a subdirectory", () => {
    expect(originRepo(path.join(repo, "src", "deep"))).toEqual({ host: "github.com", owner: "acme", name: "webapp" });
  });
  test("found from a linked worktree (.git file → commondir)", () => {
    const wt = path.join(root, "wt");
    runGit(repo, "worktree", "add", "-q", wt);
    expect(originRepo(wt)).toEqual({ host: "github.com", owner: "acme", name: "webapp" });
  });
  test("no repository or no origin → null", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-noremote-"));
    expect(originRepo(plain)).toBeNull();
    runGit(plain, "init", "-q");
    expect(originRepo(plain)).toBeNull();
  });
  test("git.repo uses it when stdin has no workspace.repo, and prefers stdin when present", async () => {
    const payload = { session_id: "remote", workspace: { current_dir: repo } };
    expect(await renderWidget(payload, { widget: "git.repo" })).toBe("acme/webapp");
    const withRepo = { session_id: "remote", workspace: { current_dir: repo, repo: { host: "github.com", owner: "other", name: "thing" } } };
    expect(await renderWidget(withRepo, { widget: "git.repo" })).toBe("other/thing");
  });
});
