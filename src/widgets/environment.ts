import { defineWidget } from "../core/types.js";
import { sanitizeDisplayText } from "../data/utils/sanitize.js";
import { labelSchema, stdin, withLabel } from "./_shared.js";

export const envCounts = defineWidget<{ showClaudeMd: boolean; showRules: boolean; showMcp: boolean; showHooks: boolean; hideZero: boolean }>({
  id: "environment.counts",
  name: "Config counts",
  description: "CLAUDE.md / rules / MCP servers / hooks in effect for this directory.",
  category: "environment",
  sample: "1 CLAUDE.md | 1 MCPs | 6 hooks",
  schema: {
    type: "object",
    properties: {
      showClaudeMd: { type: "boolean", default: true },
      showRules: { type: "boolean", default: true },
      showMcp: { type: "boolean", default: true },
      showHooks: { type: "boolean", default: true },
      hideZero: { type: "boolean", default: true, title: "Hide zero counts" },
    },
  },
  defaults: { showClaudeMd: true, showRules: true, showMcp: true, showHooks: true, hideZero: true },
  render(ctx, o, api) {
    const parts: string[] = [];
    const push = (on: boolean, n: number, word: string) => {
      if (!on) return;
      if (o.hideZero && n <= 0) return;
      parts.push(`${n} ${word}`);
    };
    push(o.showClaudeMd, ctx.claudeMdCount, "CLAUDE.md");
    push(o.showRules, ctx.rulesCount, "rules");
    push(o.showMcp, ctx.mcpCount, "MCPs");
    push(o.showHooks, ctx.hooksCount, "hooks");
    if (!parts.length) return null;
    return [api.seg(parts.join(" | "), { fg: "muted" })];
  },
});

export const envOutputStyle = defineWidget<{ label: string | null }>({
  id: "environment.outputStyle",
  name: "Output style",
  description: "Active Claude Code output style (hidden when default).",
  category: "environment",
  sample: "style: explanatory",
  schema: { type: "object", properties: { label: { ...labelSchema, default: "style:" } } },
  defaults: { label: "style:" },
  render(ctx, o, api) {
    const name = stdin(ctx).output_style?.name ?? ctx.outputStyle;
    if (!name || name === "default") return null;
    const label = withLabel(o.label, "style:");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(sanitizeDisplayText(name))];
  },
});

export const envThinking = defineWidget<Record<string, never>>({
  id: "environment.thinking",
  name: "Thinking indicator",
  description: "Shows 💭 when extended thinking is enabled.",
  category: "environment",
  sample: "💭",
  schema: { type: "object", properties: {} },
  defaults: {},
  render(ctx, _o, api) {
    return stdin(ctx).thinking?.enabled ? [api.seg("💭", { fg: "accent" })] : null;
  },
});
