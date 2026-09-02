---
description: Wire claude-code-ssp into ~/.claude/settings.json as the statusLine (keeps a backup; /ssp:install --dry-run to preview)
allowed-tools: Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh:*)
---

If the user passed `--dry-run` (arguments: $ARGUMENTS), run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh" install --dry-run
```

and show the planned `statusLine` JSON. Otherwise run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh" install
```

Then tell the user, in one short paragraph: where the backup was written, that the previous statusLine is preserved and
`/ssp:doctor` or `claude-code-ssp uninstall` restores it, and that a **new** Claude Code session is needed to pick up the
changed command.
