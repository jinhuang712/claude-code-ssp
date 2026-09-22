/**
 * Git / jj status for the statusline: an on-disk cache per working directory, a short render
 * deadline, and a detached background refresh when the deadline is missed.
 *
 * Why all three:
 *  - Claude Code re-runs the statusline on every event (debounced ~300 ms) and kills a run that is
 *    still going, so a render must finish fast and exit. Git on a large or network repo can take
 *    far longer than that.
 *  - The cache is trusted only while the repo's marker files are unchanged AND it is younger than
 *    `git.cacheMs` — markers alone miss unstaged edits (they don't touch HEAD or the index), and a
 *    TTL alone would show a pre-commit dirty state after a commit.
 *  - When a fresh status misses the deadline the render shows the last known status instead of
 *    nothing, and a detached helper (vcs-refresh.ts) finishes the job and writes the cache, so the
 *    next render is correct. The render process itself never waits for it.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getHudPluginDir } from "../data/claude-config-dir.js";
import { getGitStatus, type GitStatus } from "../data/git.js";
import { getJjStatus, isJjRepo } from "../data/jj.js";
import type { FooterConfig } from "./types.js";

export type Vcs = "git" | "jj";

/** What the cache stores per working directory. */
export interface VcsCacheEntry {
  /** When the status computation started (markers were read at the same moment). */
  savedAt: number;
  vcs: Vcs;
  /** Opaque fingerprint of the repo's marker files; any change invalidates the entry. */
  markers: string;
  status: GitStatus | null;
}

/** Default render deadline for a fresh VCS status, in ms. Well under Claude Code's ~300 ms debounce. */
export const VCS_DEADLINE_MS = 200;
/** A refresh lock younger than this means a helper is already running for this directory. */
const REFRESH_LOCK_MS = 10_000;

export function vcsCachePath(cwd: string): string {
  const key = Buffer.from(path.resolve(cwd)).toString("base64url").slice(0, 120);
  return path.join(getHudPluginDir(os.homedir()), "git-cache", `${key}.json`);
}

function mtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Walk up from cwd to the directory containing `name`, like git and jj locate their repo root. */
function findUp(cwd: string, name: string): { root: string; marker: string; stat: fs.Stats } | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 64; i++) {
    const marker = path.join(dir, name);
    try {
      return { root: dir, marker, stat: fs.lstatSync(marker) };
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * git: HEAD (branch switch, commit) + index (stage, commit, checkout). A `.git` *file* is a worktree
 * or submodule pointer (`gitdir: …`) and is followed to the real git dir.
 */
function gitMarkers(cwd: string): string | null {
  const found = findUp(cwd, ".git");
  if (!found) return null;
  let gitDir = found.marker;
  if (found.stat.isFile()) {
    try {
      const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(found.marker, "utf8"));
      if (!m) return null;
      gitDir = path.resolve(found.root, m[1]!.trim());
    } catch {
      return null;
    }
  }
  const head = mtime(path.join(gitDir, "HEAD"));
  if (!head) return null;
  return `${head}:${mtime(path.join(gitDir, "index"))}`;
}

/**
 * jj: every jj operation (including the working-copy snapshot any jj command takes) writes a new
 * operation head, so the op-heads directory's mtime changes. In a secondary workspace `.jj/repo`
 * is a file holding the path of the shared repo dir.
 */
function jjMarkers(cwd: string): string {
  const found = findUp(cwd, ".jj");
  if (!found) return "0";
  let repoDir = path.join(found.marker, "repo");
  try {
    if (fs.statSync(repoDir).isFile()) repoDir = path.resolve(found.marker, fs.readFileSync(repoDir, "utf8").trim());
  } catch {
    /* no repo dir: fall back to TTL-only caching */
  }
  return `${mtime(path.join(repoDir, "op_heads", "heads"))}`;
}

/** Which VCS owns cwd and its current marker fingerprint; null when cwd is in no repo. */
export function vcsMarkers(cwd: string): { vcs: Vcs; markers: string } | null {
  if (isJjRepo(cwd)) return { vcs: "jj", markers: jjMarkers(cwd) };
  const markers = gitMarkers(cwd);
  return markers ? { vcs: "git", markers } : null;
}

export function readVcsCache(cwd: string): VcsCacheEntry | null {
  try {
    const entry = JSON.parse(fs.readFileSync(vcsCachePath(cwd), "utf8")) as Partial<VcsCacheEntry>;
    if (typeof entry.savedAt !== "number" || (entry.vcs !== "git" && entry.vcs !== "jj") || typeof entry.markers !== "string") return null;
    return entry as VcsCacheEntry;
  } catch {
    return null;
  }
}

function writeVcsCache(cwd: string, entry: VcsCacheEntry): void {
  try {
    const file = vcsCachePath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry), { mode: 0o600 });
    fs.renameSync(tmp, file); // atomic: a concurrent render never reads half a file
  } catch {
    /* best effort: a missing cache only costs a recompute */
  }
}

function computeStatus(vcs: Vcs, cwd: string): Promise<GitStatus | null> {
  return vcs === "jj" ? getJjStatus(cwd) : getGitStatus(cwd);
}

/**
 * Compute a fresh status and cache it, with the collectors' normal per-command timeouts.
 * Used by the detached helper; also safe to call directly.
 */
export async function refreshVcsCache(cwd: string): Promise<GitStatus | null> {
  const m = vcsMarkers(cwd);
  if (!m) return null;
  const savedAt = Date.now();
  const status = await computeStatus(m.vcs, cwd);
  writeVcsCache(cwd, { savedAt, ...m, status });
  try {
    fs.rmSync(`${vcsCachePath(cwd)}.lock`, { force: true });
  } catch {
    /* a stale lock expires on its own after REFRESH_LOCK_MS */
  }
  return status;
}

/**
 * Start vcs-refresh.ts detached (own process group, no stdio) so it outlives this render and is not
 * caught by Claude Code killing the render. A lock file keeps back-to-back renders on a slow repo
 * from each spawning another helper.
 */
function spawnDetachedRefresh(cwd: string): void {
  const lock = `${vcsCachePath(cwd)}.lock`;
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs < REFRESH_LOCK_MS) return;
  } catch {
    /* no lock: go ahead */
  }
  try {
    fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
    fs.writeFileSync(lock, String(process.pid), { mode: 0o600 });
    const script = fileURLToPath(new URL("./vcs-refresh.ts", import.meta.url));
    const child = spawn(process.execPath, [script, cwd], { detached: true, stdio: "ignore", env: process.env, windowsHide: true });
    child.unref();
  } catch {
    /* can't spawn: the next render simply tries again in-process */
  }
}

export interface ResolveVcsOptions {
  /** How long this render waits for a fresh status before falling back to the cached one. */
  deadlineMs?: number;
  /** Test hooks. */
  compute?: (vcs: Vcs, cwd: string) => Promise<GitStatus | null>;
  refreshInBackground?: (cwd: string) => void;
}

/**
 * Status for the render: cached when still valid, fresh when it arrives within the deadline,
 * otherwise the last known status (possibly slightly stale, never blank) plus a background refresh.
 */
export async function resolveVcsStatus(
  cwd: string | undefined,
  config: FooterConfig,
  now: number,
  opts: ResolveVcsOptions = {},
): Promise<GitStatus | null> {
  if (!cwd || !config.git.enabled) return null;
  const m = vcsMarkers(cwd);
  if (!m) return null;
  const cached = readVcsCache(cwd);
  const sameRepo = cached !== null && cached.vcs === m.vcs;
  if (sameRepo && cached.markers === m.markers && now - cached.savedAt < config.git.cacheMs) return cached.status;

  const compute = opts.compute ?? computeStatus;
  const fresh = compute(m.vcs, cwd).then(
    (status) => {
      writeVcsCache(cwd, { savedAt: now, ...m, status });
      return { status };
    },
    () => ({ status: null }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), opts.deadlineMs ?? VCS_DEADLINE_MS);
  });
  const won = await Promise.race([fresh, late]);
  clearTimeout(timer);
  if (won) return won.status;
  (opts.refreshInBackground ?? spawnDetachedRefresh)(cwd);
  return sameRepo ? cached.status : null;
}
