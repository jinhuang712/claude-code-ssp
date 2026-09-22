# claude-code-ssp

A Claude Code statusline you configure in your browser.

* **Web configurator** on `127.0.0.1:4877` — arrange widgets in left / center / right zones by drag or
  keyboard, see every option's effect rendered live against your **real** session, hover a preset,
  theme, bar style or separator to try it on before applying. English and 简体中文, light and dark.
* **Widget registry** — 39 built-ins (model, git, PR, context, rate limits, tokens, cost, agents, todos, tools, MCP…).
* **User plugins** — drop a `.ts`/`.js` file in `~/.config/claude-code-ssp/widgets/`; a broken plugin shows `⚠`
  instead of blanking the line.
* **Zone layout** — the right zone is truly right-aligned; any widget can go anywhere; overflow wraps, truncates or drops.
* **Fast & local** — ~20 ms per render including Bun startup, even on 100 MB transcripts (parsed incrementally);
  slow git never blocks the line. No network, no credential scraping. Data layer derived from
  [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT).

Requires Claude Code ≥ 2.1.251 (for `rate_limits`, `prompt_cache`, `effort` on stdin) and [Bun](https://bun.sh) on `PATH`.

## Quick start

```bash
claude plugin marketplace add jinhuang712/claude-code-ssp
claude plugin install ssp@claude-code-ssp
```

Then, inside Claude Code:

```
/ssp:config     # opens the configurator (starts the local server if needed)
/ssp:reset      # zero this session's cost / tokens / API calls / lines-changed counters
```

Your first edit in the panel applies the statusline to `~/.claude/settings.json` (a backup is kept).
**If you already use another statusline** (claude-hud, a script…), the panel asks before replacing it, and
*Advanced settings → Stop using this statusline* puts it back at any time. Every later edit saves
automatically and shows on the next refresh.

From a terminal, using a local checkout:

```bash
git clone https://github.com/jinhuang712/claude-code-ssp && cd claude-code-ssp && bun install

bun run serve -- --open           # configurator at http://127.0.0.1:4877
bun src/cli/main.ts install       # add the statusLine to ~/.claude/settings.json (backup kept)
COLUMNS=120 bun src/cli/main.ts render --fixture src/fixtures/basic.json   # preview in the terminal
```

## Commands

| Command | Purpose |
|---|---|
| `render` | stdin JSON → statusline (what Claude Code runs) |
| `serve [--port N] [--open]` | local web configurator + JSON API |
| `serve --sandbox` | the same on `:4878`, editing throwaway copies of your config, samples and statusLine |
| `install [--dry-run] [--replace]` | add our `statusLine` to settings.json; `--replace` is required when another statusline is set (it is kept for `uninstall`) |
| `uninstall` | remove our `statusLine` and restore the one it replaced (never touches a statusline that isn't ours) |
| `reset [--session ID] [--undo]` | zero the session counters from now on (`/ssp:reset` passes the current session) |
| `doctor` | the panel's *Diagnostics*, for terminals without a browser |

## Config

`~/.config/claude-code-ssp/config.json` (user) ← `<project>/.claude/claude-code-ssp.json` (project overlay).
Objects deep-merge, `lines` replaces wholesale. Re-read on every render, so saves apply on the next refresh.

The panel writes **only what you changed** into the file it saves to: untouched settings keep following the
defaults, and a project's settings never leak into your user file. When the session you preview belongs to a
project with its own config file, the header lets you choose between *Your settings* and *This project only*.

```jsonc
{
  "theme": "tokyo-night",              // default | nord | dracula | gruvbox | tokyo-night | catppuccin | mono | {…inline}
  "colorLevel": "auto",                // auto | truecolor | 256 | 16 | none
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

## Security model

* The configurator listens on `127.0.0.1` only and answers only requests whose `Host` and `Origin` are its own
  address — other web pages can't read your sessions or change your settings, and DNS rebinding is refused.
  Writes must be JSON; there is no CORS.
* **Project widgets are code.** `<project>/.claude/claude-code-ssp/widgets/*` runs on every statusline refresh, so it
  only loads for projects listed in `plugins.trustedProjects` in your *user* config (the panel's *Diagnostics* has a
  *Trust this project* button). A project's own config can't trust itself or add plugin folders.
* The preview only renders captured samples and built-in fixtures, never paths a request supplies.

## Writing a widget

```ts
// ~/.config/claude-code-ssp/widgets/hello.ts
export default {
  id: "example.hello", name: "Hello", description: "…", category: "misc",
  schema: { type: "object", properties: { name: { type: "string", default: "friend" } } },
  defaults: { name: "friend" },
  render(ctx, opts, api) {                    // ctx: stdin, transcript, gitStatus, columns, now, theme …
    return [api.seg(`👋 ${opts.name}`, { fg: "accent" })];
  },
};
```

See `examples/widgets/hello.ts` and `src/widgets/*` for the built-ins; `DESIGN.md` for the architecture.
Restart the configurator to see a new widget in the “+” list (the statusline picks it up immediately).

## Development

```bash
bun test                  # layout, config, server security, install, transcript, git cache, web build freshness…
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
