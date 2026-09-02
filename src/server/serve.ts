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
import { install, planInstall } from "./install.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(here, "..", "..", "web", "dist");
const FIXTURES_DIR = path.resolve(here, "..", "fixtures");

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

async function handleApi(req: Request, url: URL): Promise<Response> {
  const cwd = url.searchParams.get("cwd") ?? process.cwd();
  switch (`${req.method} ${url.pathname}`) {
    case "GET /api/config": {
      const eff = loadEffectiveConfig(cwd);
      return json({ ...eff, paths: { user: userConfigPath(), project: projectConfigPath(cwd) } });
    }
    case "PUT /api/config": {
      const body = (await req.json()) as { scope?: "user" | "project"; config: Partial<FooterConfig> };
      const normalized = normalizeConfig(body.config ?? {});
      const { $schema: _s, ...toWrite } = { ...body.config, version: normalized.version } as Partial<FooterConfig>;
      const written = body.scope === "project" ? writeProjectConfig(cwd, toWrite) : writeUserConfig(toWrite);
      return json({ ok: true, path: written, config: normalized });
    }
    case "GET /api/widgets":
      return json(widgetManifest());
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
      const body = (await req.json()) as { config?: Partial<FooterConfig>; sampleId?: string; payload?: unknown; columns?: number };
      const config = normalizeConfig(body.config ?? loadEffectiveConfig(cwd).config);
      const now = Date.now();
      const sample = body.payload ?? allSamples().find((x) => x.id === body.sampleId)?.payload ?? fixtureSamples()[0]?.payload ?? {};
      const stdin = hydrate(sample, now) as StdinData;
      const ctx = await buildContext(stdin, config, { columns: body.columns ?? 120, now, deadlineMs: 800 });
      const out = render(config, ctx);
      return json(out);
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

export async function serve(opts: { port: number; open?: boolean }): Promise<void> {
  registerBuiltinWidgets();
  const { config } = loadEffectiveConfig(process.cwd());
  const plugins = await loadPlugins(config, process.cwd());
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) {
        try {
          const res = await handleApi(req, url);
          res.headers.set("access-control-allow-origin", "*");
          res.headers.set("access-control-allow-headers", "content-type");
          res.headers.set("access-control-allow-methods", "GET,PUT,POST,OPTIONS");
          return res;
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,PUT,POST,OPTIONS" } });
      return serveStatic(url.pathname);
    },
  });
  const address = `http://127.0.0.1:${server.port}`;
  console.log(`claude-code-ssp configurator → ${address}`);
  if (plugins.errors.length) for (const e of plugins.errors) console.error(`plugin error ${e.file}: ${e.message}`);
  if (opts.open) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    Bun.spawn([opener, address], { stdout: "ignore", stderr: "ignore" });
  }
}
