/**
 * owner/name of the `origin` remote, read straight from the repository's config file.
 *
 * Claude Code sends `workspace.repo` for most repositories, but not always (one of the author's
 * sessions with a GitHub origin arrived without it), and git.repo then showed nothing. This is the
 * fallback: no subprocess, just a walk up to `.git`, a hop through `gitdir:`/`commondir` for linked
 * worktrees, and a parse of `[remote "origin"] url`. Anything unexpected yields null.
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface RepoRef {
  host: string;
  owner: string;
  name: string;
}

/** The config file of the repository containing `start`, or null outside a repository. */
function gitConfigFor(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 64; i++) {
    const dotGit = path.join(dir, ".git");
    try {
      const st = fs.statSync(dotGit);
      if (st.isDirectory()) return path.join(dotGit, "config");
      // Linked worktree / submodule: ".git" is a file pointing at the real git dir, whose
      // `commondir` (worktrees) points back at the shared repository that owns the config.
      const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotGit, "utf8"));
      if (!m) return null;
      const gitDir = path.resolve(dir, m[1].trim());
      let common = gitDir;
      try {
        common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim());
      } catch {
        /* submodule: its git dir holds the config itself */
      }
      return path.join(common, "config");
    } catch {
      /* no .git here: keep walking up */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * host/owner/name from a remote URL: https://host/owner/name(.git), git@host:owner/name(.git) or
 * ssh://git@host[:port]/owner/name(.git). Nested groups (GitLab) keep everything but the last
 * segment as the owner.
 */
export function parseRemoteUrl(url: string): RepoRef | null {
  const u = url.trim();
  let host: string;
  let pathPart: string;
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(u); // git@github.com:owner/name.git
  if (scp) {
    host = scp[1]!;
    pathPart = scp[2]!;
  } else {
    try {
      const parsed = new URL(u);
      if (!/^(https?|ssh|git):$/.test(parsed.protocol)) return null;
      host = parsed.hostname;
      pathPart = parsed.pathname;
    } catch {
      return null;
    }
  }
  const parts = pathPart.replace(/\.git\/?$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return { host, owner: parts.slice(0, -1).join("/"), name: parts[parts.length - 1] };
}

/** owner/name of `origin` for the repository containing `cwd`, or null. */
export function originRepo(cwd: string | undefined): RepoRef | null {
  if (!cwd) return null;
  const config = gitConfigFor(cwd);
  if (!config) return null;
  let text: string;
  try {
    text = fs.readFileSync(config, "utf8");
  } catch {
    return null;
  }
  // The `url =` line inside the [remote "origin"] section (sections end at the next "[").
  const section = /\[remote\s+"origin"\]([^[]*)/.exec(text)?.[1];
  const url = section ? /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1] : undefined;
  return url ? parseRemoteUrl(url) : null;
}
