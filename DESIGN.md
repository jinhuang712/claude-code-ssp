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
| `claude-code-ssp install` / `uninstall` | Atomic merge into `~/.claude/settings.json` (`.bak.<ts>` backup). |
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
  sample?: "Context ███░░░░░░░ 32%",                    // shown in the widget picker
});
```

`Segment = { text, style?: { fg, bg, bold, dim, italic, underline }, link? }`. Colors are theme tokens
(`fg muted accent ok warn crit model project git usage context`) or literals (`#rrggbb`, `208`, `red`).
`api.level(pct, warnAt, critAt)` returns `ok | warn | crit` so every numeric widget gets consistent thresholds.

## Plugins

`~/.config/claude-code-ssp/widgets/*.{js,ts,mjs}` and `<project>/.claude/claude-code-ssp/widgets/*` are dynamically
imported; each module's default export is a widget definition or an array of them. A plugin that throws at load or at
render time is replaced by a dim `⚠ <id>` segment — a broken plugin never blanks the statusline.

## Config layering

`defaults` → `~/.config/claude-code-ssp/config.json` (or `$CLAUDE_CODE_SSP_CONFIG`) → `<cwd>/.claude/claude-code-ssp.json`.
Objects deep-merge; `lines` replaces wholesale. The web UI shows which layer set each value and lets you edit either.
Config is re-read on every render (cheap: one small JSON) so saves from the web UI apply on the next tick.

## Web UI (`web/`, React + Tailwind + zustand + xterm.js + dnd-kit)

* **Preview** = `POST /api/render { config, sample, columns }` → the **same** render engine; output painted by xterm.js.
  WYSIWYG by construction.
* **Samples**: bundled fixtures (fresh session, post-compact null usage, 1M context, no rate_limits, worktree, vim mode)
  plus **live captures**: `render` persists the last stdin payload per `session_id` to `<data>/samples/` (throttled), so
  you preview against your real session.
* **Widget picker** renders option forms from each widget's JSON Schema. Drag widgets between zones and lines.
* **Theme editor** with ok/warn/crit swatches; `colorLevel` downgrade preview.
* **Install** button performs the settings.json merge.

## Performance budget

Claude Code debounces at 300 ms and kills in-flight scripts. Target **< 40 ms warm** for `render`:
* no UI/server imports on the render path (separate entry, lazy `import()` for `serve`);
* transcript parser reuses claude-hud's mtime/size cache; git results cached on `.git/HEAD` + `.git/index` mtime per cwd
  with `--no-optional-locks`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, hard timeouts;
* a `bun test` asserts the fixture render stays under budget.

## Data root

`$CLAUDE_CONFIG_DIR/plugins/claude-code-ssp/` (defaults to `~/.claude/plugins/claude-code-ssp/`): transcript-cache,
context-cache, speed-cache, config-cache, samples. Files 0600, dirs 0700, temp+rename writes (inherited conventions).
