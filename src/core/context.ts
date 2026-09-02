/**
 * Builds the widget-facing context from stdin + the harvested data collectors.
 * Collectors run concurrently and each is individually bounded so a slow git never blanks the line.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { applyContextWindowFallback } from "../data/context-cache.js";
import { countConfigs } from "../data/config-reader.js";
import { resolveEffortLevel } from "../data/effort.js";
import { getGitStatus, type GitStatus } from "../data/git.js";
import { getJjStatus, isJjRepo } from "../data/jj.js";
import { getUsageFromStdin } from "../data/stdin.js";
import { parseTranscript } from "../data/transcript.js";
import type { StdinData, TranscriptData } from "../data/types.js";
import { getHudPluginDir } from "../data/claude-config-dir.js";
import { formatDuration } from "./api.js";
import type { Ctx, FooterConfig } from "./types.js";

export interface BuildOptions {
  columns?: number;
  now?: number;
  /** Per-collector deadline in ms. */
  deadlineMs?: number;
}

async function bounded<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- git cache -------------------------------------------------------------

interface GitCacheEntry {
  savedAt: number;
  headMtime: number;
  indexMtime: number;
  status: GitStatus | null;
}

function gitCachePath(cwd: string): string {
  const key = Buffer.from(path.resolve(cwd)).toString("base64url").slice(0, 120);
  return path.join(getHudPluginDir(os.homedir()), "git-cache", `${key}.json`);
}

function gitMarkers(cwd: string): { headMtime: number; indexMtime: number } | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 64; i++) {
    const dotGit = path.join(dir, ".git");
    try {
      const st = fs.lstatSync(dotGit);
      let gitDir = dotGit;
      if (st.isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, "utf8"));
        if (!m) return null;
        gitDir = path.resolve(dir, m[1]!.trim());
      }
      const head = fs.statSync(path.join(gitDir, "HEAD")).mtimeMs;
      let index = 0;
      try {
        index = fs.statSync(path.join(gitDir, "index")).mtimeMs;
      } catch {
        /* fresh repo */
      }
      return { headMtime: head, indexMtime: index };
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export async function resolveVcsStatus(cwd: string | undefined, config: FooterConfig, now: number): Promise<GitStatus | null> {
  if (!cwd || !config.git.enabled) return null;
  if (isJjRepo(cwd)) return getJjStatus(cwd);
  const markers = gitMarkers(cwd);
  if (!markers) return null;
  const cachePath = gitCachePath(cwd);
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8")) as GitCacheEntry;
    if (
      cached.headMtime === markers.headMtime &&
      cached.indexMtime === markers.indexMtime &&
      now - cached.savedAt < Math.max(config.git.cacheMs, 30_000) // markers unchanged: trust for up to 30s
    ) {
      return cached.status;
    }
    if (now - cached.savedAt < config.git.cacheMs) return cached.status;
  } catch {
    /* miss */
  }
  const status = await getGitStatus(cwd);
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true, mode: 0o700 });
    const tmp = `${cachePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: now, ...markers, status } satisfies GitCacheEntry), { mode: 0o600 });
    fs.renameSync(tmp, cachePath);
  } catch {
    /* best effort */
  }
  return status;
}

// ---- context ---------------------------------------------------------------

const EMPTY_TRANSCRIPT: TranscriptData = { tools: [], skills: [], mcpServers: [], mcpErrors: [], agents: [], todos: [] };

export function resolveColumns(env: NodeJS.ProcessEnv = process.env, offset = 0): number {
  const raw = env.COLUMNS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  let cols = 0;
  if (Number.isFinite(n) && n > 10) cols = n;
  else if (process.stdout.columns && process.stdout.columns > 10) cols = process.stdout.columns;
  if (cols === 0) return 0; // unknown → layout falls back to plain joins
  return Math.max(20, cols - offset);
}

export async function buildContext(stdin: StdinData, config: FooterConfig, opts: BuildOptions = {}): Promise<Omit<Ctx, "theme">> {
  const now = opts.now ?? Date.now();
  const deadline = opts.deadlineMs ?? 1500;
  const cwd = stdin.workspace?.current_dir ?? stdin.cwd;

  const transcriptP = bounded(parseTranscript(stdin.transcript_path ?? ""), deadline, EMPTY_TRANSCRIPT);
  const countsP = bounded(countConfigs(cwd), deadline, { claudeMdCount: 0, rulesCount: 0, mcpCount: 0, hooksCount: 0 });
  const gitP = bounded(resolveVcsStatus(cwd, config, now), deadline, null);

  const transcript = await transcriptP;
  applyContextWindowFallback(stdin, {}, transcript.sessionName, {
    lastCompactBoundaryAt: transcript.lastCompactBoundaryAt,
    lastCompactPostTokens: transcript.lastCompactPostTokens,
  });
  const [counts, gitStatus] = await Promise.all([countsP, gitP]);

  const effort = resolveEffortLevel(stdin.effort, { ultracodeActive: transcript.ultracodeActive });
  const sessionDuration = transcript.sessionStart ? formatDuration(now - transcript.sessionStart.getTime()) : "";

  return {
    stdin,
    transcript,
    claudeMdCount: counts.claudeMdCount,
    rulesCount: counts.rulesCount,
    mcpCount: counts.mcpCount,
    hooksCount: counts.hooksCount,
    sessionDuration,
    gitStatus,
    usageData: getUsageFromStdin(stdin),
    memoryUsage: null,
    extraLabel: null,
    outputStyle: counts.outputStyle,
    effortLevel: effort?.level,
    effortSymbol: effort?.symbol,
    columns: opts.columns ?? resolveColumns(process.env, config.columnsOffset),
    now,
  };
}
