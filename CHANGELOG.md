# Changelog

Versions follow the plugin manifest (`.claude-plugin/plugin.json`); marketplace installs update when it changes.

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
