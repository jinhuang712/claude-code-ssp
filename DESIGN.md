# claude-code-ssp — Design

A Claude Code statusline that is configured from a **localhost web UI**, built around a
**widget registry** and **user plugins**, with a **zone-based layout** (left / center / right per line).

## Why not extend claude-hud

claude-hud's data layer (transcript parsing, git hardening, context glitch repair, sanitizing) is excellent and MIT —
we harvest it verbatim into `src/data/` (see `licenses/claude-hud.LICENSE`). Its render/config layer is the problem:
elements only merge when physically adjacent in `elementOrder`, sub-segments of the project line can never be
right-aligned, the tokens line is hard-coded outside the layout loop, and labels are baked into i18n strings.
Upstream's CONTRIBUTING scope bar ("two-line default, no onboarding steps, avoid deps") rules out a web configurator.

Claude Code ≥ 2.1.251 now ships `rate_limits`, `prompt_cache`, `effort`, `cost`, `context_window.used_percentage`,
`pr`, `worktree`, `workspace.repo` on stdin, so no OAuth scraping is needed. We stay **local-only, no network**.

## Modes (one binary)

| Command | Purpose |
|---|---|
| `claude-code-ssp render` | stdin JSON → ANSI lines on stdout. Hot path. Imports only `core` + `widgets` + `data`. |
| `claude-code-ssp serve [--port 4877] [--open]` | Bun.serve on 127.0.0.1 serving `web/dist` + JSON API. Lazy-imported. |
| `claude-code-ssp serve --sandbox` | Same on `:4878` against temp copies of config, samples and statusLine (for UI work and automation). |
| `claude-code-ssp install [--replace]` / `uninstall` | Atomic merge into `~/.claude/settings.json` (`.bak.<ts>` backup). Replacing a statusLine that isn't ours needs `--replace` (the panel asks); it is parked under `statusLine.previous.claude-code-ssp` and `uninstall` restores it. `uninstall` never touches a statusLine that isn't ours. |
| `claude-code-ssp reset [--session ID]` | Baseline the session counters; `/ssp:reset` passes `$CLAUDE_CODE_SESSION_ID` so the right session is reset. |
| `claude-code-ssp doctor` | Shows effective config, layer provenance, last captured payload, render timing. |

## Layout model

```jsonc
{
  "version": 1,
  "theme": "default",            // name or inline theme object
  "colorLevel": "auto",           // auto | truecolor | 256 | 16 | none
  "separator": " │ ",             // between widgets inside a zone
  "lines": [
    { "left":  [{ "widget": "project.path", "options": { "levels": "full" } }, { "widget": "git.branch" }],
      "right": [{ "widget": "model.badge" }] },
    { "left":  [{ "widget": "usage.windows" }],
      "right": [{ "widget": "context.bar" }] },
    { "left":  [{ "widget": "tokens.session" }],
      "right": [{ "widget": "session.started" }, { "widget": "session.lastReply" }] }
  ]
}
```

* A **line** has three zones. `right` is truly right-aligned to `$COLUMNS`; `center` is centered in the remaining gap.
* Any widget may go in any zone. There is no adjacency rule and no special "first line".
* Overflow policy per line: `wrap` (default: right zone drops to its own right-aligned row), `truncate`, `drop-right`.
* A widget that renders `null` simply disappears; separators collapse.

## Widget contract (`src/core/types.ts`)

```ts
defineWidget({
  id: "context.bar",                 // namespaced, stable
  name: "Context bar", category: "context", description: "...",
  schema: { type: "object", properties: { width: { type: "integer", default: 10 } } },  // JSON Schema → web form
  defaults: { width: 10 },
  render(ctx, opts, api): Segment[] | string | null,   // pure; ctx is read-only
  numeric?(ctx, opts): number | null,                  // enables generic threshold coloring in the UI
  sample?: "Context ███░░░░░░░ 32%",                    // stands in when the session has no data; sizes preset sketches
});
```

An option schema may carry `"x-requires": { sibling: value }` when it only affects the output while
another option has that value (cacheGlyph needs `style: "arrows"`, barWidth needs `bar: true`). The panel dims
it and names the requirement; `tests/option-sweep.test.ts` renders every value of every option — requirements
met — against every built-in sample and fails when an option can never change the output.

`Segment = { text, style?: { fg, bg, bold, dim, italic, underline }, link? }`. Colors are theme tokens
(`fg muted accent ok warn crit model project git usage context`), literals (`#rrggbb`, `208`, `red`) or `default`
(no colour code: the terminal's own foreground). Every theme maps `fg` to `default`, so plain values stay readable on
light terminals; only accents are coloured.
`api.level(pct, warnAt, critAt)` returns `ok | warn | crit` so every numeric widget gets consistent thresholds.

## Plugins

`~/.config/claude-code-ssp/widgets/*.{js,ts,mjs}` and `<project>/.claude/claude-code-ssp/widgets/*` are dynamically
imported; each module's default export is a widget definition or an array of them. A plugin that throws at load or at
render time is replaced by a dim `⚠ <id>` segment — a broken plugin never blanks the statusline.

**Trust.** Plugins are code that runs on every render, so a project's widget folder loads only when the project is
listed in `plugins.trustedProjects` of the *user* config. `plugins.*` in a project config is ignored entirely (a repo
you just cloned can't trust itself or point at other folders). Skipped folders are reported in `/api/doctor`.

## Config layering

`defaults` → `~/.config/claude-code-ssp/config.json` (or `$CLAUDE_CODE_SSP_CONFIG`) → `<cwd>/.claude/claude-code-ssp.json`.
Objects deep-merge; `lines` replaces wholesale. The web UI shows which layer set each value and lets you edit either.
Config is re-read on every render (cheap: one small JSON) so saves from the web UI apply on the next tick.

The panel edits the *effective* config but saves a *layer*: it replays only the paths changed since the last save onto
the target file (`web/src/layers.ts`), so defaults are never frozen into a file and project values never leak into the
user file. The project is the previewed session's directory (`?cwd=`, accepted only for captured sessions).

## Web UI (`web/`, React + Tailwind + zustand + xterm.js + dnd-kit)

* **Look**: Claude Code's own design language, defined as tokens at the top of `web/src/index.css` — warm
  ivory/slate neutrals, one fixed clay accent (`--clay`, not the edited theme's colour, so focus rings and the
  primary button keep their contrast), serif titles over a sans body, mono for everything that mirrors the
  terminal, and the ✻ mark. Surfaces are told apart by fill, not borders — page < row (`--row`) < chip
  (`--chip`), two aliases whose order flips with the scheme; outlines are kept for the terminal, inputs
  (3:1 edges), the sticky header's rule, floating popovers and the clay selection ring. Every text token is
  checked for WCAG AA on every surface; icons are inline SVGs
  (`components/Icon.tsx`). The page reads Layout (templates behind a button by its title, the tray of unused
  widgets under the lines) → Style (three summaries — theme, bar, separator — each opening its choices in
  place). Rarely used things stay off the page:
  render settings (width, terminal ground, right margin, colour depth, snapshots) sit behind the preview's
  sliders button; repairs, project config, diagnostics, the way out and the viewer's language/appearance
  behind the header's ⋯ menu. There is no footer.

* **Preview** = `POST /api/render { config, sample, columns }` → the **same** render engine; output painted by xterm.js
  on a dark or light terminal ground with a matching ANSI palette, under a quiet mock of Claude Code's prompt
  (context only — the statusline sits below the prompt). WYSIWYG by construction.
* **Probes**: an open options panel's one line of current output is rendered against the current sample —
  coalesced into one `POST /api/render/batch` per tick (`web/src/probe.ts`) and drawn in colour (`Ansi.tsx`).
* **Try-on**: hovering/focusing a template, theme, bar style, separator or tray widget previews it
  without saving (templates only on keyboard focus: opening their menu focuses the first one). The preview's
  height is sticky during try-ons (a shrinking preview moved the hovered chip away and looped), and the
  "Previewing: …" label lives inside the prompt row for the same reason.
* **Samples**: bundled fixtures (fresh session, post-compact null usage, 1M context, no rate_limits, worktree, vim mode,
  Bedrock). `basic` and `post-compact` point at bundled sample transcripts whose timestamps are seconds relative to
  now; `src/core/fixtures.ts` writes a real copy with ISO times, so agents, todos, tools, MCP, output speed and
  compactions preview as if live.
  Plus **live captures**: `render` persists the last stdin payload per `session_id` to `<data>/samples/` (throttled), so
  you preview against your real session. Live samples are shown exactly as captured — no synthetic values.
* **Tray**: every widget not in the layout sits under it, grouped by category (`custom.*` stay after use — they are
  meant to be placed several times). Click one to append it to the last line (focus moves to the new chip), drag it
  into any zone, or drag a placed chip back onto the tray to remove it; hovering one tries it on in the preview. The
  tray replaced a "+" in every zone and a picker drawer. Drag widgets between zones and lines, or move them with
  Alt+Arrow keys; Delete removes a focused chip.
* **Options open in place**: clicking a chip unfolds its options under its own line (the line and the panel read as
  one card) — it replaced a side drawer that dimmed the page. The form is generated from the widget's JSON Schema
  by kind: enums as a row of choices, every boolean in one group of toggles, `warnAt` + `critAt` as one threshold
  band, colour as swatches, bold as one more toggle (the raw JSON is in Diagnostics → Config JSON). Hovering a value leaves the preview alone (a
  statusline changing under the pointer while reading was distracting); a click applies and is undoable, and
  the panel keeps one line of what the widget prints now.
* **Install**: the first save auto-applies unless another tool's statusLine is set — then the server answers 409 and
  the panel asks. *⋯ menu → Stop using this statusline* (two steps: it first says what comes back) restores the previous one.
* **i18n**: typed message objects (`web/src/i18n`), English and 简体中文, browser-detected with a switcher.
* **Security**: see `src/server/guard.ts` — own Host/Origin only, no CORS, JSON-only writes, 1 MB cap.
* **Shipping**: `web/dist` is committed (marketplace installs run it as-is), stamped with a hash of its sources;
  `tests/web-dist.test.ts` fails when it is stale.

## Performance budget

Claude Code debounces at 300 ms and kills in-flight scripts. Target **< 40 ms warm** for `render`:
* no UI/server imports on the render path (separate entry, lazy `import()` for `serve`);
* the transcript is parsed **incrementally** from a saved byte offset (a full parse only when the file was truncated or
  replaced), so a new message costs the same on a 100 MB transcript as on a small one;
* git/jj calls run in parallel under a ~200 ms deadline. On a miss the render uses the last cached status and a
  detached helper (`src/core/vcs-refresh.ts`, one per repo via a lock file) finishes the work for the next render.
  The cache honours `git.cacheMs` and is invalidated by `.git/HEAD` / `.git/index` changes;
* `render` exits as soon as stdout is flushed — nothing lingering keeps Claude Code waiting;
* output speed is measured from the transcript tail (latest response: output tokens ÷ request→last entry), not from
  consecutive renders — Claude Code re-runs the statusline per message, not while a response streams;
* `tests/render-budget.test.ts` times the whole CLI (startup included), not just `render()`.

## Data root

`$CLAUDE_CONFIG_DIR/plugins/claude-code-ssp/` (defaults to `~/.claude/plugins/claude-code-ssp/`): transcript-cache,
context-cache, config-cache, samples. Files 0600, dirs 0700, temp+rename writes (inherited conventions).
