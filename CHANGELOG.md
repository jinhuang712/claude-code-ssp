# Changelog

Versions follow the plugin manifest (`.claude-plugin/plugin.json`); marketplace installs update when it changes.

## Unreleased

- **Language switch in the header:** EN / 中文, beside the ⋯ menu. It leaves the menu, where it was a dropdown
  you had to read the current language to find.
- **Appearance switch in the header** too: system / light / dark, as three icons next to the language. The ⋯
  menu now holds only the rare actions (re-apply, reset counters, project config, diagnostics, stop using).
- **"Single rate-limit window" leaves the tray.** "Rate-limit windows" shows the same with 7d and spend switched
  off. Lines that already use it keep working and can still be edited.
- **"Context value" and "Current context tokens" leave the tray too:** Context usage shows the percentage with its
  bar off, and the tokens with "Show used/total tokens". Lines that use them keep working.
- "Context bar" is now called **Context usage** (上下文用量): with "Show bar" off it is the percentage alone, so
  "bar" undersold it. Its id, `context.bar`, is unchanged.
- The **Minimal** preset shows its context figure with Context usage (bar off) instead of Context value. It prints
  the same `ctx 32%`; a layout picked from the old Minimal now shows as Custom.
- The page no longer rubber-bands past its top or bottom on a trackpad, which dragged the pinned header down
  and left a gap above it.
- Opening the preview settings or the ⋯ menu with the mouse no longer lights up its first control ("Fit to
  window" looked selected). Opened from the keyboard, focus still lands on it.

## 0.3.0 — 2026-09-23

A simpler configurator: the page is the layout and the style, and everything else is one click away.

- **Widgets are added from a tray** of unused ones under the layout, one group per row: click to append to the
  last line, drag to put one anywhere, drag a chip back onto the tray (or press Delete) to remove it. It replaces
  the "+" in every zone and the picker drawer.
- **Options open in place**, under the widget's own line, instead of in a side drawer. Values are a row of choices;
  booleans are one group of toggles; warn/crit thresholds are one band.
- **Presets come first:** Minimal, Standard, Full or Custom, as cards at the top of Layout. The line editor and the
  widget tray belong to Custom; a custom layout is kept while you look at a preset and comes back with Custom.
  **Full** is a new layout: project and session name · model / repo, branch and lines changed · context bar /
  usage · prompt cache / cost and tokens · output speed, with gradient colours and bars (it had session
  times, agents and todos).
  **Style** is three summaries (theme, bar, separator) that open their choices in place.
- **Off the page:** render settings (width, terminal ground, right margin, colour mode, snapshots) sit behind the
  preview's sliders button; re-apply, reset counters, project config, diagnostics, "stop using", language and
  appearance behind the header's ⋯ menu. The Advanced and Diagnostics sections, the footer and the center-zone
  toggle are gone (a config that already uses the center zone stays editable).
- Chips show just the widget's name; surfaces are separated by fill rather than borders (80 outlined elements on
  the page before, 2 now).
- **The preview is part of the page.** No terminal window around it any more (border, title bar, black ground,
  mock prompt): a small *Preview* label with the column count and settings, the lines on the same fill as the
  layout rows, the note under them. "Trying on …" shows beside the label. A dark or light terminal picked in the
  preview settings still gets its own ground.
- **Everything is 10% larger**, and the preview's lines a little more (13px → 16px). Sizes now follow your
  browser's font-size setting too.
- **The preview follows your session.** `/ssp:config` opens the page bound to the session you ran it in, and the
  preview's data picker is gone (without a session it shows the most recent one).
- **No undo.** The Undo button, Ctrl/⌘+Z and the "… — Ctrl/⌘+Z to undo" toasts are gone: they were more noise
  than help. Edits still save on their own; a custom layout survives a trip to a preset within the page view.
- **The right side of a line never moves.** When a line is too long, the left side is now cut short with `…` so
  every line stays one row, and the right side keeps its place at the end of it. Per line you can have the left
  side continue on the next row instead (breaking between widgets). Before, the right side dropped to a row of
  its own. "Hide the right side" is no longer offered (configs that use it keep working). A line with widgets
  on one side only follows the same rules; before, it was never cut and the terminal broke it mid-word.
- **Gradient colours read on light terminals.** The gradient colour mode (context bar, usage) started at pure
  white and stayed pastel up to 70%, so a low bar or percentage all but vanished on a white terminal. Every stop
  is now a mid-tone that clears 3:1 on white, slate and black; on dark terminals the colours are a little less bright.

## 0.2.2 — 2026-09-23

A redesign of the web configurator in Claude Code's own design language.

- Warm ivory/slate surfaces, one clay accent, serif titles, soft corners, the ✻ mark and a clay favicon.
  The panel's accent no longer changes with the statusline theme (a yellow or grey theme took the focus
  rings and the Apply button's contrast with it); themes show their colours in their swatches and the preview.
- The preview draws the statusline under a mock Claude Code prompt, and its toolbar controls have labels.
- Presets are cards with a sketch of each layout; theme, bar style and separator are one *Style* card; the
  layout editor is one card with category dots on the chips.
- Option values read like a Claude Code menu (`❯` marks the current one); the picker has a search field.
- Accessibility: every text colour checked for WCAG AA in both schemes, input edges at 3:1, choices expose
  their state (`aria-pressed`), the page has a `<main>` landmark, the chip × no longer fades out, and long
  widget names truncate instead of clipping on a phone.

## 0.2.1 — 2026-09-23

A sweep of every widget option against real sessions, and fixes for everything that didn't work.

- **Output speed (tok/s) works.** It never showed: the claude-hud tracker it relied on needs renders while a
  response streams, which Claude Code doesn't do. It now measures the latest response from the transcript
  (end to end, replies under 200 tokens skipped).
- Labels never run into their value (`Compacted 2`, not `Compacted2`); `custom.env` gets a *Show NAME=* toggle
  and says when no variable is set.
- MCP count includes servers from enabled and claude.ai-synced plugins.
- Cost and the provider label agree on Bedrock/Vertex (env switch or model id).
- Agent models read `opus 5.5` instead of `claude-opus-5-5[1m]`.
- `git.repo` falls back to `origin` in `.git/config` when Claude Code doesn't send the repo.
- Options that only act with another option on are dimmed with a reason in the panel.
- Built-in samples include a sample transcript (agents, todos, tools, MCP, speed preview) and a Bedrock session;
  live samples are no longer padded with made-up values.
- Input without a `session_id` is no longer saved as an "unknown" session.
- A helper exported from a widget module can no longer crash the statusline at startup.
- New `tests/option-sweep.test.ts` keeps every option working.

## 0.2.0 — 2026-09-23

### Safer by default
- The configurator only answers its own page: Host/Origin checks, no CORS, JSON-only writes, 1 MB cap.
  Other websites can no longer read your sessions or rewrite `settings.json`.
- A project's own widgets (code that runs on every refresh) load only for projects you trust in your user config.
- Installing asks before replacing another statusline (claude-hud, a script…); the old one is kept, and
  *Advanced settings → Stop using this statusline* restores it. `uninstall` never removes a statusline that isn't ours.
- The saved statusLine command survives `brew upgrade` and plugin updates.
- The panel saves only what you changed: defaults are no longer frozen into your config, and a project's settings
  no longer leak into your user file. The session you preview decides which project a project-level save goes to.

### Web configurator
- English and 简体中文 (browser-detected, switcher in the footer); light and dark themes.
- Every option previews in colour against your real session; on/off options show both outcomes.
- Hover or focus a preset, theme, bar style or separator to try it on before applying.
- Keyboard: no more Tab trap in the preview; Alt+Arrow keys move widgets; drawers are proper dialogs.
- Works at half-screen and phone widths; readable contrast; a first-run guide; honest save status.
- Sessions grouped by project; a dark/light terminal background for the preview.
- The built UI ships with the plugin — no build step on first `/ssp:config`.

### Statusline
- Plain values use the terminal's own foreground in every theme (readable on light terminals).
- ~25 ms per render even on 100 MB transcripts once the first parse is done (new messages are parsed
  incrementally; the very first render of a huge transcript still takes a few hundred ms). Slow git no longer
  delays the line: a stale-but-cached status shows while a background refresh catches up.
- Truncation keeps colours and links intact; emoji and wide characters are measured correctly.
- `/ssp:reset` resets the session it was run from.

### Removed
- The npm `bin` launcher and `dist/` bundle: the plugin runs from source with Bun (marketplace only).

## 0.1.0

Initial release.
