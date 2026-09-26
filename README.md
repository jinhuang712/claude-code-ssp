# claude-code-super-statusline

**❯ super-statusline** — a Claude Code statusline you design in your browser, against your real session.
(Called claude-code-ssp before 0.4.0 — see [Upgrading from claude-code-ssp](#upgrading-from-claude-code-ssp).)

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/statusline-light.png">
  <img alt="The Full preset: project, session name, model; repo, branch, lines changed, context bar; rate-limit windows, prompt cache; cost, tokens, output speed" src="docs/images/statusline-dark.png">
</picture>

*The Full preset with gradient bars, on the bundled sample session (`src/fixtures/basic.json`).*

* **Web configurator** on `127.0.0.1:4877` — start from a preset (Minimal, Standard, Full) or build your
  own: arrange widgets in left / right zones by drag or keyboard, add them from the tray of unused widgets,
  and edit a widget's options right under its line. The preview draws your **real** session — the one you
  ran `/super-statusline:config` from — and hovering a preset, theme, bar style or separator tries it on before you
  apply it. English and 简体中文, light and dark.
* **Widget registry** — 42 built-ins (model, git, PR, context, rate limits, tokens, cost, agents, todos, tools, MCP…).
* **User plugins** — drop a `.ts`/`.js` file in `~/.config/claude-code-super-statusline/widgets/`; a broken plugin shows `⚠`
  instead of blanking the line.
* **Zone layout** — the right zone is truly right-aligned and never moves; any widget can go anywhere; a left side
  too long for the terminal is cut short with `…` (or, per line, continues on the next row).
* **Fast & local** — ~20 ms per render including Bun startup, even on 100 MB transcripts (parsed incrementally);
  slow git never blocks the line. No network, no credential scraping. Data layer derived from
  [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT).

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/configurator-light.png">
  <img alt="The configurator: a live preview of the statusline, Style (theme, bar glyphs, progress bar mode, separator) and Layout presets" src="docs/images/configurator-dark.png">
</picture>

<img alt="A widget's options opened under its line: label, percentage, bar width, text colour, thresholds and toggles" src="docs/images/options-dark.png">

Requires Claude Code ≥ 2.1.251 (for `rate_limits`, `prompt_cache`, `effort` on stdin) and [Bun](https://bun.sh) on `PATH`.

## Quick start

```bash
claude plugin marketplace add jinhuang712/claude-code-super-statusline
claude plugin install super-statusline@claude-code-super-statusline
```

Then, inside Claude Code:

```
/super-statusline:config     # opens the configurator on this session's data (starts the local server if needed)
```

Your first edit in the panel applies the statusline to `~/.claude/settings.json` (a backup is kept).
**If you already use another statusline** (claude-hud, a script…), the panel asks before replacing it, and
*⋯ menu → Stop using this statusline* puts it back at any time. Every later edit saves
automatically and shows on the next refresh.

From a terminal, using a local checkout:

```bash
git clone https://github.com/jinhuang712/claude-code-super-statusline && cd claude-code-super-statusline && bun install

bun run serve -- --open           # configurator at http://127.0.0.1:4877
bun src/cli/main.ts install       # add the statusLine to ~/.claude/settings.json (backup kept)
COLUMNS=120 bun src/cli/main.ts render --fixture src/fixtures/basic.json   # preview in the terminal
```

## Upgrading from claude-code-ssp

Up to 0.3.x the plugin was `ssp@claude-code-ssp` with `/ssp:config`. The rename can't carry an install over by
itself: once your `claude-code-ssp` marketplace updates, `ssp` shows as disabled and `/ssp:*` is gone, while the
statusline keeps showing 0.3.3. Switch once:

```bash
claude plugin marketplace add jinhuang712/claude-code-super-statusline
claude plugin install super-statusline@claude-code-super-statusline
```

Then run `/super-statusline:config` in Claude Code: it points your statusline at the new plugin (keeping your
tweaks, and the statusline it replaced for *Stop using this statusline*), and your config, widgets, snapshots and
counter resets move to the new folder names. After that, remove the old plugin:

```bash
claude plugin uninstall ssp@claude-code-ssp
claude plugin marketplace remove claude-code-ssp
```

## Commands

| Command | Purpose |
|---|---|
| `render` | stdin JSON → statusline (what Claude Code runs) |
| `serve [--port N] [--open]` | local web configurator + JSON API |
| `serve --sandbox` | the same on `:4878`, editing throwaway copies of your config, samples and statusLine |
| `install [--dry-run] [--replace]` | add our `statusLine` to settings.json; `--replace` is required when another statusline is set (it is kept for `uninstall`) |
| `uninstall` | remove our `statusLine` and restore the one it replaced (never touches a statusline that isn't ours) |
| `reset [--session ID] [--undo]` | zero the session counters from now on (default: the most recent session; the panel's ⋯ → *Reset counters* does the same for the session it previews) |
| `doctor` | the panel's *Diagnostics*, for terminals without a browser |

## Config

`~/.config/claude-code-super-statusline/config.json` (user) ← `<project>/.claude/claude-code-super-statusline.json`
(project overlay). Objects deep-merge, `lines` replaces wholesale. Re-read on every render, so saves apply on the next
refresh.
Before 0.4.0 the user folder was `~/.config/claude-code-ssp/`; it is moved to the new name the first time the new
version runs, and so is the data folder (`~/.claude/plugins/claude-code-ssp/`: snapshots, counter resets, caches).
Project files are never moved (they may be committed): a project's `.claude/claude-code-ssp.json` or
`.claude/claude-code-ssp/widgets/` keeps working where it is; rename it when your team is ready.

The panel writes **only what you changed** into the file it saves to: untouched settings keep following the
defaults, and a project's settings never leak into your user file. When the session you preview belongs to a
project with its own config file, the header lets you choose between *Your settings* and *This project only*.

```jsonc
{
  "theme": "tokyo-night",              // default | nord | dracula | gruvbox | tokyo-night | catppuccin | mono | {…inline}
  "colorLevel": "auto",                // auto | truecolor | 256 | 16 | none
  "colorMode": "thresholds",           // thresholds | gradient — how every bar and percentage is coloured
  "separator": " │ ",
  "columnsOffset": 2,                  // cells reserved for Claude Code's own footer padding
  "lines": [
    { "left":  [{ "widget": "project.path", "options": { "levels": "tilde" } }, { "widget": "git.branch" }],
      "right": [{ "widget": "model.badge" }, { "widget": "cost.session" }] },
    { "left":  [{ "widget": "usage.windows", "options": { "bar": true } }],
      "right": [{ "widget": "context.bar" }], "overflow": "wrap" }
  ],
  "git": { "enabled": true, "cacheMs": 2000 },
  "plugins": { "dirs": [], "trustedProjects": [] },
  "captureSamples": true
}
```

Each widget instance: `{ "widget": "<id>", "options": {…}, "style": { "fg", "bg", "bold", "dim", "italic", "underline" }, "label": "…" | null }`.
Colors are theme tokens (`fg muted accent ok warn crit model project git usage context`), literals
(`#rrggbb`, `208`, `red`), or `default` — the terminal's own color. Every built-in theme prints plain values in
`default`, so they stay readable on light terminals too.

`colorMode` (*Style → Progress bar mode* in the panel) applies to every percentage widget — Context usage, Context
value, Rate-limit windows, Single rate-limit window. `thresholds` colours a value green, then yellow from the widget's
*Warn at %* and red from its *Critical at %*; `gradient` runs grey → blue → green → yellow → orange → red with the
percentage and ignores *Warn at %* (*Critical at %* still makes the number bold). Up to 0.4.1 this was an option on
each widget: a config that still has those is read as `gradient` if any widget asked for it, otherwise `thresholds`.

## Security model

* The configurator listens on `127.0.0.1` only and answers only requests whose `Host` and `Origin` are its own
  address — other web pages can't read your sessions or change your settings, and DNS rebinding is refused.
  Writes must be JSON; there is no CORS.
* **Project widgets are code.** `<project>/.claude/claude-code-super-statusline/widgets/*` runs on every statusline refresh, so it
  only loads for projects listed in `plugins.trustedProjects` in your *user* config (*⋯ menu → Diagnostics* has a
  *Trust this project* button). A project's own config can't trust itself or add plugin folders.
* The preview only renders captured samples and built-in fixtures, never paths a request supplies.

## Writing a widget

```ts
// ~/.config/claude-code-super-statusline/widgets/hello.ts
export default {
  id: "example.hello", name: "Hello", description: "…", category: "misc",
  schema: { type: "object", properties: { name: { type: "string", default: "friend" } } },
  defaults: { name: "friend" },
  render(ctx, opts, api) {                    // ctx: stdin, transcript, gitStatus, columns, now, theme …
    return [api.seg(`👋 ${opts.name}`, { fg: "accent" })];
  },
};
```

An option that only matters while another one is set can say so with `"x-requires"` — e.g.
`barWidth: { type: "integer", "x-requires": { bar: true } }` — and the panel dims it with a hint instead of
showing a control that seems to do nothing. `"x-requires-config"` does the same for a top-level config key, e.g.
`{ "colorMode": "thresholds" }`. A widget that draws a percentage should colour it with
`api.levelColor(pct, api.level(pct, warnAt, critAt), "fg")`, which follows the user's Progress bar mode.

See `examples/widgets/hello.ts` and `src/widgets/*` for the built-ins; `DESIGN.md` for the architecture.
Restart the configurator to see a new widget under *Unused widgets* (the statusline picks it up immediately).

## Development

```bash
bun test                  # layout, config, server security, install, transcript, git cache, option sweep, web build freshness…
bun run typecheck
bun run serve:sandbox     # configurator on :4878 against temp copies — safe to click around or automate
bun run dev:web           # Vite dev server on :5178 proxying /api → :4877 (run `bun run serve` alongside)
bun run build:web         # rebuild web/dist — it is committed, so commit it with any web/src change
scripts/ui-smoke.sh       # headless browser check of the configurator (playwright-cli), see the script
```

`web/dist` is committed on purpose: marketplace installs run it as-is, without a `bun install` and build.
`tests/web-dist.test.ts` fails when it is stale.

## License

MIT (see `LICENSE`). `src/data/` is derived from claude-hud © Jarrod Watts, MIT — see `licenses/claude-hud.LICENSE`.
