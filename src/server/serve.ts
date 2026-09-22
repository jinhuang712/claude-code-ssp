/**
 * Local web configurator. Serves web/dist and a small JSON API on 127.0.0.1 only.
 * The preview endpoint runs the exact same render engine as the statusline.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { listLiveSamples, type Sample } from "../core/capture.js";
import { loadEffectiveConfig, normalizeConfig, projectConfigPath, userConfigPath, writeProjectConfig, writeUserConfig } from "../core/config.js";
import { buildContext } from "../core/context.js";
import { render } from "../core/layout.js";
import { loadPlugins } from "../core/plugins.js";
import { widgetManifest } from "../core/registry.js";
import { listThemes } from "../core/theme.js";
import type { FooterConfig } from "../core/types.js";
import type { StdinData } from "../data/types.js";
import { registerBuiltinWidgets } from "../widgets/index.js";
import { guardRequest, HttpError, MAX_BODY_BYTES, readJson } from "./guard.js";
import { install, planInstall, settingsPath } from "./install.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = fs.realpathSync(path.resolve(here, "..", ".."));
const WEB_DIST = path.join(ROOT, "web", "dist");
const STARTED_AT = Date.now();
const SRC_DIR = path.join(ROOT, "src");
const FIXTURES_DIR = path.join(SRC_DIR, "fixtures");

/** True once any server source file is newer than this process, e.g. after a git pull. */
function changedSince(dir: string, since: number): boolean {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() ? changedSince(p, since) : fs.statSync(p).mtimeMs > since) return true;
  }
  return false;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** Fixtures store 0 for time fields; hydrate them relative to now so previews look alive. */
function hydrate(payload: unknown, now: number): unknown {
  const p = structuredClone(payload) as Record<string, any>;
  const sec = Math.floor(now / 1000);
  if (p.rate_limits?.five_hour && !p.rate_limits.five_hour.resets_at) p.rate_limits.five_hour.resets_at = sec + 3 * 3600 + 41 * 60;
  if (p.rate_limits?.seven_day && !p.rate_limits.seven_day.resets_at) p.rate_limits.seven_day.resets_at = sec + 5 * 86400 + 2 * 3600;
  if (p.prompt_cache && !p.prompt_cache.expires_at) p.prompt_cache.expires_at = sec + 42 * 60;
  return p;
}

function fixtureSamples(): Sample[] {
  try {
    return fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        id: `fixture:${f.replace(/\.json$/, "")}`,
        label: `fixture · ${f.replace(/\.json$/, "")}`,
        capturedAt: null,
        payload: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf8")),
        source: "fixture" as const,
      }));
  } catch {
    return [];
  }
}

function allSamples(): Sample[] {
  return [...listLiveSamples(), ...fixtureSamples()];
}

/** The project directory a captured stdin payload belongs to, if it says. */
export function sampleCwd(payload: unknown): string | null {
  const p = payload as { workspace?: { current_dir?: unknown }; cwd?: unknown } | null | undefined;
  const dir = p?.workspace?.current_dir ?? p?.cwd;
  return typeof dir === "string" && dir !== "" ? dir : null;
}

/** Canonical form for comparing directories: symlinks resolved when the path exists. */
function canonicalDir(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

/**
 * `?cwd=` picks which project's config layer the API reads and writes. Left open, any caller could
 * make us read — or, through a project-scope save, write — `.claude/claude-code-ssp.json` in an
 * arbitrary directory. So it may only name the directory the server runs in or the project of a
 * session Claude Code has actually rendered a statusline for (a captured sample).
 */
function resolveCwd(url: URL): string {
  const asked = url.searchParams.get("cwd");
  if (asked === null || asked === "") return process.cwd();
  const wanted = canonicalDir(asked);
  const known = new Set([canonicalDir(process.cwd())]);
  for (const s of listLiveSamples()) {
    const dir = sampleCwd(s.payload);
    if (dir) known.add(canonicalDir(dir));
  }
  if (!known.has(wanted)) throw new HttpError(400, "cwd must be the server's directory or the project of a captured session");
  return wanted;
}

/**
 * Preview width in terminal cells. 0 is the unbounded single-line probe the options drawer uses;
 * anything else is clamped to a plausible terminal so a request can't ask for a 10-million-column
 * render (which once produced a 20 MB response). Missing → 120, like a typical wide terminal.
 */
export function parseColumns(value: unknown): number {
  if (value === undefined || value === null) return 120;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "columns must be 0 or a positive number");
  if (n === 0) return 0;
  return Math.min(500, Math.max(20, Math.floor(n)));
}

async function handleApi(req: Request, url: URL): Promise<Response> {
  const cwd = resolveCwd(url);
  switch (`${req.method} ${url.pathname}`) {
    case "GET /api/config": {
      const eff = loadEffectiveConfig(cwd);
      return json({ ...eff, paths: { user: userConfigPath(), project: projectConfigPath(cwd) } });
    }
    case "PUT /api/config": {
      const body = await readJson<{ scope?: "user" | "project"; config: Partial<FooterConfig> }>(req);
      const normalized = normalizeConfig(body.config ?? {});
      const { $schema: _s, ...toWrite } = { ...body.config, version: normalized.version } as Partial<FooterConfig>;
      const written = body.scope === "project" ? writeProjectConfig(cwd, toWrite) : writeUserConfig(toWrite);
      return json({ ok: true, path: written, config: normalized });
    }
    case "GET /api/health":
      // ssp.sh uses this to tell a server from another checkout (or one started before a pull) from this one.
      return json({
        ok: true,
        root: ROOT,
        pid: process.pid,
        startedAt: STARTED_AT,
        codeChanged: fs.existsSync(SRC_DIR) ? changedSince(SRC_DIR, STARTED_AT) : true,
        webBuilt: fs.existsSync(path.join(WEB_DIST, "index.html")),
      });
    case "GET /api/widgets":
      return json(widgetManifest());
    case "GET /api/doctor": {
      // Everything the old `doctor` CLI printed, so the panel can show provenance and raw inputs.
      const eff = loadEffectiveConfig(cwd);
      const plugins = await loadPlugins(eff.config, cwd);
      let statusLine: unknown = null;
      let settingsError: string | null = null;
      try {
        statusLine = (JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as { statusLine?: unknown }).statusLine ?? null;
      } catch (err) {
        settingsError = (err as Error).message;
      }
      const live = listLiveSamples()[0];
      return json({
        layers: eff.layers.map((l) => ({ name: l.name, path: l.path, exists: l.exists, error: l.error ?? null })),
        plugins: { dirs: plugins.dirs, loaded: plugins.loaded, errors: plugins.errors, skipped: plugins.skipped },
        settings: { path: settingsPath(), statusLine, error: settingsError },
        lastPayload: live ? { id: live.id, capturedAt: live.capturedAt, payload: live.payload } : null,
      });
    }
    case "GET /api/themes":
      return json(listThemes());
    case "GET /api/samples":
      return json(allSamples().map(({ payload: _p, ...rest }) => rest));
    case "GET /api/sample": {
      const id = url.searchParams.get("id");
      const s = allSamples().find((x) => x.id === id);
      return s ? json(s) : json({ error: "not found" }, 404);
    }
    case "POST /api/render": {
      // No client-supplied stdin payload: it could name any transcript_path / cwd on disk and turn the
      // preview into a file and git-status oracle. Previews render captured samples or fixtures only.
      const body = await readJson<{ config?: Partial<FooterConfig>; sampleId?: string; columns?: number; fillEmpty?: boolean }>(req);
      const config = normalizeConfig(body.config ?? loadEffectiveConfig(cwd).config);
      // The preview is painted by xterm.js, which speaks truecolor; "auto" would otherwise follow this server's env.
      if (config.colorLevel === "auto") config.colorLevel = "truecolor";
      const now = Date.now();
      const sample = allSamples().find((x) => x.id === body.sampleId)?.payload ?? fixtureSamples()[0]?.payload ?? {};
      const stdin = hydrate(sample, now) as StdinData;
      const ctx = await buildContext(stdin, config, { columns: parseColumns(body.columns), now, deadlineMs: 800 });
      const out = render(config, ctx, { fillEmpty: body.fillEmpty === true });
      return json(out);
    }
    case "POST /api/reset": {
      const { resetLatestSession, undoReset } = await import("./reset.js");
      const body = await readJson<{ sessionId?: string; undo?: boolean }>(req);
      if (body.undo && body.sessionId) {
        undoReset(body.sessionId);
        return json({ ok: true, undone: body.sessionId });
      }
      const r = await resetLatestSession(body.sessionId);
      return r ? json(r) : json({ error: "no captured session yet" }, 404);
    }
    case "GET /api/install":
      return json(planInstall({ dryRun: true }));
    case "POST /api/install": {
      const r = install();
      return json(r);
    }
    default:
      return json({ error: "not found" }, 404);
  }
}

function serveStatic(pathname: string): Response {
  let rel = pathname === "/" ? "/index.html" : pathname;
  let file = path.join(WEB_DIST, rel);
  if (!file.startsWith(WEB_DIST)) return new Response("forbidden", { status: 403 });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    rel = "/index.html";
    file = path.join(WEB_DIST, rel);
  }
  if (!fs.existsSync(file)) {
    return new Response("web UI not built yet — run `bun run build:web` (or `bun run dev:web` for hot reload against this API)", { status: 503 });
  }
  const ext = path.extname(file);
  return new Response(Bun.file(file), { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
}

/**
 * The whole HTTP surface as a plain function of (request, port), so tests can drive it without
 * binding a socket. `port` is the port we are actually served on — the guard needs it to know which
 * Host / Origin values are ours.
 */
export async function handleRequest(req: Request, port: number): Promise<Response> {
  const denied = guardRequest(req, port);
  if (denied) return denied;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) {
    try {
      return await handleApi(req, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
  if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "method not allowed" }, 405);
  return serveStatic(url.pathname);
}

export async function serve(opts: { port: number; open?: boolean }): Promise<void> {
  registerBuiltinWidgets();
  const { config } = loadEffectiveConfig(process.cwd());
  const plugins = await loadPlugins(config, process.cwd());
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    // Bun enforces this before our handler runs; readJson re-checks for bodies without Content-Length.
    maxRequestBodySize: MAX_BODY_BYTES,
    fetch: (req, srv) => handleRequest(req, srv.port ?? opts.port),
  });
  const address = `http://127.0.0.1:${server.port}`;
  console.log(`claude-code-ssp configurator → ${address}`);
  if (plugins.errors.length) for (const e of plugins.errors) console.error(`plugin error ${e.file}: ${e.message}`);
  if (opts.open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    Bun.spawn([opener, address], { stdout: "ignore", stderr: "ignore" });
  }
}
