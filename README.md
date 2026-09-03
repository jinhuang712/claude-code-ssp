# claude-code-ssp

A Claude Code statusline you configure in your browser.

* **Web configurator** on `127.0.0.1:4877` — drag widgets between left / center / right zones, edit options from
  schema-generated forms, pick a theme, preview against your **real** session data, click *Install*.
* **Widget registry** — 38 built-ins (model, git, PR, context, rate limits, tokens, cost, agents, todos, tools, MCP…).
* **User plugins** — drop a `.ts`/`.js` file in `~/.config/claude-code-ssp/widgets/`; broken plugins show `⚠` instead of blanking the line.
* **Zone layout** — the right zone is truly right-aligned; any widget can go anywhere; overflow wraps, truncates or drops.
* **Fast & local** — ~1 ms render, ~20 ms with Bun startup; no network, no credential scraping. Data layer harvested
  from [claude-hud](https://github.com/jarrodwatts/claude-hud) (MIT).

Requires Claude Code ≥ 2.1.251 (for `rate_limits`, `prompt_cache`, `effort` on stdin) and [Bun](https://bun.sh).

## Quick start

```bash
git clone https://github.com/jinhuang712/claude-code-ssp ~/dev/projects/claude-code-ssp
cd ~/dev/projects/claude-code-ssp && bun install && (cd web && bun install) && bun run build:web

bun run serve -- --open        # configurator at http://127.0.0.1:4877
bun src/cli/main.ts install    # merges statusLine into ~/.claude/settings.json (backup kept)
```

Or preview from the terminal without Claude Code:

```bash
COLUMNS=120 bun src/cli/main.ts render --fixture src/fixtures/basic.json
```

## Commands

| Command | Purpose |
|---|---|
| `render` | stdin JSON → statusline (what Claude Code runs) |
| `serve [--port N] [--open]` | local web configurator + JSON API |
| `install [--dry-run]` / `uninstall` | manage the `statusLine` entry in settings.json |
| `doctor` | same information as the panel's 高级设置 → 诊断, for terminals without a browser |

## Config

`~/.config/claude-code-ssp/config.json` (user) ← `<project>/.claude/claude-code-ssp.json` (project overlay).
Objects deep-merge, `lines` replaces wholesale. Re-read on every render, so saves apply on the next refresh.

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
      "right": [{ "widget": "context.bar" }], "overflow": "wrap" },
    { "left":  [{ "widget": "tokens.session", "options": { "style": "arrows" } }],
      "right": [{ "widget": "session.started" }, { "widget": "session.lastReply" }] }
  ],
  "git": { "enabled": true, "cacheMs": 2000 },
  "plugins": { "dirs": [] },
  "captureSamples": true
}
```

Each widget instance: `{ "widget": "<id>", "options": {…}, "style": { "fg", "bg", "bold", "dim", "italic", "underline" }, "label": "…" | null }`.
Colors are theme tokens (`fg muted accent ok warn crit model project git usage context`) or literals (`#rrggbb`, `208`, `red`).

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

## Development

```bash
bun test                  # layout, config, render-budget, all-widgets smoke
bun run typecheck
bun run dev:web           # Vite dev server on :5178 proxying /api → :4877 (run `bun run serve` alongside)
CLAUDE_CODE_SSP_DEBUG=1 COLUMNS=120 bun src/cli/main.ts render --fixture src/fixtures/basic.json
```

## License

MIT. `src/data/` is derived from claude-hud © Jarrod Watts, MIT — see `licenses/claude-hud.LICENSE`.
