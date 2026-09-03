---
description: Reset the statusline's cumulative counters (cost, tokens, API calls, lines changed) for the current session
allowed-tools: Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh:*)
---

If the user passed `--undo` (arguments: $ARGUMENTS), run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh" reset --undo
```

Otherwise run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/ssp.sh" reset
```

Report its one-line output verbatim. The counters shown in the statusline (Cost, Tokens, API calls, lines changed) restart
from zero at this point for the current session; the statusline picks it up on its next refresh.
