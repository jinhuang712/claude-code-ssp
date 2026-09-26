/**
 * Builds the GitHub Pages site into site/dist:
 *   /        the welcome page (site/index.html + site/site.css, the README's images)
 *   /demo/   the real configurator (web/), built with web/vite.demo.config.ts so its API runs in the
 *            browser (site/demo/api.ts) against one precomputed sample session
 *
 *   bun site/build.ts            build
 *   bun site/build.ts --serve    build, then serve site/dist on http://127.0.0.1:4880
 *
 * The sample session is src/fixtures/basic.json made live the way the configurator does it
 * (prepareFixture), in a throwaway git repo so the git widgets show a real branch and changes.
 * Everything runs under a temporary HOME / CLAUDE_CONFIG_DIR: the demo must never pick up the
 * builder's own ~/.claude (MCP servers, hooks, rules would otherwise be counted into it).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(SITE, "dist");
const BUILD = path.join(SITE, ".build");
/** Where the sample session claims to live; node-shims.ts reports the same home to the widgets. */
const DEMO_HOME = "/Users/you";
const DEMO_PROJECT = `${DEMO_HOME}/dev/webapp`;

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "super-statusline-site-")));
process.env.HOME = path.join(tmp, "home");
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, "claude");
process.env.XDG_CONFIG_HOME = path.join(tmp, "xdg");
fs.mkdirSync(process.env.HOME, { recursive: true });

function run(cmd: string[], cwd: string): void {
  const r = Bun.spawnSync({ cmd, cwd, stdout: "inherit", stderr: "inherit", env: process.env });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed (${r.exitCode})`);
}

/** A tiny repo on feat/login with one modified and one untracked file: `git:(feat/login*) !1 ?1`. */
function demoRepo(): string {
  const dir = path.join(tmp, "webapp");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "login.ts"), "export function login() {\n  return true;\n}\n");
  fs.writeFileSync(path.join(dir, "README.md"), "# webapp\n");
  const git = (...args: string[]) => run(["git", "-c", "user.name=demo", "-c", "user.email=demo@example.com", "-c", "init.defaultBranch=main", ...args], dir);
  git("init", "-q");
  git("remote", "add", "origin", "https://github.com/acme/webapp.git");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  git("checkout", "-q", "-b", "feat/login");
  fs.appendFileSync(path.join(dir, "src", "login.ts"), "\nexport const remember = true;\n");
  fs.writeFileSync(path.join(dir, "src", "session.ts"), "export {};\n");
  return dir;
}

/** The precomputed data context, Dates as { $date } (JSON has no Date), temp paths rewritten. */
async function demoContext(): Promise<void> {
  // Imported after HOME is set: some modules resolve their directories on first use.
  const { prepareFixture } = await import("../src/core/fixtures.ts");
  const { buildContext } = await import("../src/core/context.ts");
  const { normalizeConfig } = await import("../src/core/config.ts");
  const repo = demoRepo();
  const file = path.join(ROOT, "src/fixtures/basic.json");
  const now = Date.now();
  const payload = prepareFixture(JSON.parse(fs.readFileSync(file, "utf8")), file, now);
  payload.session_id = "demo-session";
  payload.cwd = repo;
  payload.workspace = { ...payload.workspace, current_dir: repo, project_dir: repo };
  const ctx = await buildContext(payload, normalizeConfig({ git: { enabled: true, cacheMs: 0 } }), { columns: 120, now, gitDeadlineMs: 10_000 });
  if (!ctx.gitStatus) throw new Error("demo repo: no git status — is git installed?");

  const encoded = JSON.stringify(
    { ctx, sample: { id: "demo", sessionId: "demo-session", cwd: DEMO_PROJECT, project: "webapp", model: "Sonnet 5" } },
    function (key, value) {
      const raw = (this as Record<string, unknown>)[key];
      return raw instanceof Date ? { $date: raw.toISOString() } : value;
    },
  )
    // The session "happened" in ~/dev/webapp, not in this machine's temp dir.
    .split(repo).join(DEMO_PROJECT)
    .split(tmp).join(DEMO_HOME)
    .split(os.tmpdir()).join("/tmp");
  if (encoded.includes(os.homedir())) throw new Error("demo context still mentions the real home directory");
  fs.mkdirSync(BUILD, { recursive: true });
  fs.writeFileSync(path.join(BUILD, "demo-context.json"), encoded);
}

/** The tray's category colours (web/src/colors.ts CAT_COLOR), keyed by the README's group headings. */
const GROUP_DOT: Record<string, string> = {
  "Project · Git": "#e0af68",
  "Model · Context": "#9ece6a",
  "Usage · Cost": "#7dcfff",
  Session: "#c0caf5",
  Activity: "#ff9e64",
  Environment: "#73daca",
  Other: "#9aa5ce",
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** The README's cells use `code` spans; everything else is plain text. */
const cellHtml = (s: string) => escapeHtml(s).replace(/`([^`]+)`/g, "<code>$1</code>");

/**
 * The welcome page's widget list, from the README's "## Widgets" tables — one source, and
 * tests/readme-widgets.test.ts already keeps those tables equal to what the tray offers.
 */
function widgetsHtml(): { html: string; count: number } {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const section = readme.split(/^## Widgets\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const groups: Array<{ name: string; rows: Array<[string, string]> }> = [];
  for (const line of section.split("\n")) {
    const heading = /^\*\*(.+)\*\*\s*$/.exec(line);
    if (heading) groups.push({ name: heading[1]!, rows: [] });
    else if (line.startsWith("| ") && !line.startsWith("| Widget ") && groups.length) {
      const [, name, shows] = line.split("|").map((c) => c.trim());
      groups[groups.length - 1]!.rows.push([name!, shows!]);
    }
  }
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  if (count < 30) throw new Error(`README widget tables: found only ${count} widgets — did the format change?`);
  const html = `<div class="groups">\n${groups
    .map(
      (g) =>
        `  <div class="group" style="--dot: ${GROUP_DOT[g.name] ?? "#9aa5ce"}">\n    <h3>${escapeHtml(g.name)}</h3>\n    <dl class="widgets">\n${g.rows
          .map(([n, s]) => `      <div><dt>${escapeHtml(n)}</dt><dd>${cellHtml(s)}</dd></div>`)
          .join("\n")}\n    </dl>\n  </div>`,
    )
    .join("\n")}\n</div>`;
  return { html, count };
}

function copyDir(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

async function main(): Promise<void> {
  try {
    await demoContext();
    fs.rmSync(OUT, { recursive: true, force: true });
    run(["bun", "x", "vite", "build", "--config", "vite.demo.config.ts", "--logLevel", "warn"], path.join(ROOT, "web"));
    const widgets = widgetsHtml();
    const page = fs.readFileSync(path.join(SITE, "index.html"), "utf8").replace("<!-- WIDGETS -->", widgets.html).replace("<!-- WIDGET_COUNT -->", String(widgets.count));
    fs.writeFileSync(path.join(OUT, "index.html"), page);
    fs.copyFileSync(path.join(SITE, "site.css"), path.join(OUT, "site.css"));
    fs.copyFileSync(path.join(ROOT, "web/public/favicon.svg"), path.join(OUT, "favicon.svg"));
    copyDir(path.join(ROOT, "docs/images"), path.join(OUT, "images"));
    // GitHub Pages runs Jekyll unless told not to; plain files need no processing.
    fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
    console.log(`site → ${path.relative(ROOT, OUT)}/`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (process.argv.includes("--serve")) serve();
}

/** A static server for looking at the build locally (file:// can't load ES modules). */
function serve(): void {
  const port = 4880;
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch(req) {
      const url = new URL(req.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.join(OUT, rel);
      if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response("not found", { status: 404 });
      return new Response(Bun.file(file));
    },
  });
  console.log(`serving http://127.0.0.1:${port}/`);
}

await main();
