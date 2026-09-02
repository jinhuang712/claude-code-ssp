---
description: Diagnose claude-code-ssp — effective config layers, plugins, last captured stdin sample, render timing
allowed-tools: Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh:*)
---

Run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh" doctor
```

Show the output to the user. If it lists plugin load errors or widget render errors, explain each in one sentence and
point at the file involved. Do not modify any files.
