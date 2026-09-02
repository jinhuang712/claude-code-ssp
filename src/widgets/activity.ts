import { defineWidget } from "../core/types.js";
import { sanitizeDisplayText } from "../data/utils/sanitize.js";
import { labelSchema, withLabel } from "./_shared.js";

export const activityAgents = defineWidget<{ label: string | null; max: number; showModel: boolean; showDescription: boolean }>({
  id: "activity.agents",
  name: "Running agents",
  description: "Subagents currently running (from the transcript).",
  category: "activity",
  sample: "Agents ● Explore (opus) ● general-purpose",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Agents" },
      max: { type: "integer", default: 3, minimum: 1, maximum: 10 },
      showModel: { type: "boolean", default: true },
      showDescription: { type: "boolean", default: false },
    },
  },
  defaults: { label: "Agents", max: 3, showModel: true, showDescription: false },
  numeric: (ctx) => ctx.transcript.agents.filter((a) => a.status === "running").length,
  render(ctx, o, api) {
    const running = ctx.transcript.agents.filter((a) => a.status === "running");
    if (!running.length) return null;
    const label = withLabel(o.label, "Agents");
    const segs = label ? [api.seg(`${label} `, { fg: "muted" })] : [];
    running.slice(0, o.max).forEach((a, i) => {
      if (i > 0) segs.push(api.seg(" "));
      segs.push(api.seg("● ", { fg: "ok" }));
      let text = sanitizeDisplayText(a.type);
      if (o.showModel && a.model) text += ` (${sanitizeDisplayText(a.model)})`;
      if (o.showDescription && a.description) text += `: ${sanitizeDisplayText(a.description).slice(0, 40)}`;
      segs.push(api.seg(text));
    });
    if (running.length > o.max) segs.push(api.seg(` +${running.length - o.max}`, { fg: "muted" }));
    return segs;
  },
});

export const activityTodos = defineWidget<{ label: string | null; showCurrent: boolean; bar: boolean }>({
  id: "activity.todos",
  name: "Todo progress",
  description: "Completed/total todos and the in-progress item.",
  category: "activity",
  sample: "Todos 3/7 → write tests",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Todos" },
      showCurrent: { type: "boolean", default: true, title: "Show in-progress item" },
      bar: { type: "boolean", default: false, title: "Progress bar" },
    },
  },
  defaults: { label: "Todos", showCurrent: true, bar: false },
  numeric: (ctx) => {
    const t = ctx.transcript.todos;
    return t.length ? Math.round((t.filter((x) => x.status === "completed").length / t.length) * 100) : null;
  },
  render(ctx, o, api) {
    const todos = ctx.transcript.todos;
    if (!todos.length) return null;
    const done = todos.filter((t) => t.status === "completed").length;
    const label = withLabel(o.label, "Todos");
    const segs = label ? [api.seg(`${label} `, { fg: "muted" })] : [];
    if (o.bar) segs.push(api.seg(api.bar((done / todos.length) * 100, 8) + " ", { fg: done === todos.length ? "ok" : "accent" }));
    segs.push(api.seg(`${done}/${todos.length}`, { fg: done === todos.length ? "ok" : "fg" }));
    const current = todos.find((t) => t.status === "in_progress");
    if (o.showCurrent && current) segs.push(api.seg(` → ${sanitizeDisplayText(current.content).slice(0, 50)}`, { fg: "muted" }));
    return segs;
  },
});

export const activityTools = defineWidget<{ label: string | null; max: number; runningOnly: boolean }>({
  id: "activity.tools",
  name: "Tool activity",
  description: "Recent tool calls with status glyphs.",
  category: "activity",
  sample: "Tools ⟳ Bash ✓ Read ✓ Edit",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Tools" },
      max: { type: "integer", default: 4, minimum: 1, maximum: 20 },
      runningOnly: { type: "boolean", default: false, title: "Only show running tools" },
    },
  },
  defaults: { label: "Tools", max: 4, runningOnly: false },
  render(ctx, o, api) {
    let tools = ctx.transcript.tools;
    if (o.runningOnly) tools = tools.filter((t) => t.status === "running");
    if (!tools.length) return null;
    const label = withLabel(o.label, "Tools");
    const segs = label ? [api.seg(`${label} `, { fg: "muted" })] : [];
    tools.slice(-o.max).forEach((t, i) => {
      if (i > 0) segs.push(api.seg(" "));
      const glyph = t.status === "running" ? "⟳" : t.status === "error" ? "✗" : "✓";
      const color = t.status === "running" ? "warn" : t.status === "error" ? "crit" : "ok";
      segs.push(api.seg(`${glyph} `, { fg: color }), api.seg(sanitizeDisplayText(t.name)));
    });
    return segs;
  },
});

export const activityMcp = defineWidget<{ label: string | null; max: number }>({
  id: "activity.mcp",
  name: "MCP servers used",
  description: "MCP servers called this session; failing servers are flagged.",
  category: "activity",
  sample: "MCP serena github ⚠ linear",
  schema: { type: "object", properties: { label: { ...labelSchema, default: "MCP" }, max: { type: "integer", default: 4, minimum: 1 } } },
  defaults: { label: "MCP", max: 4 },
  render(ctx, o, api) {
    const servers = ctx.transcript.mcpServers;
    const errors = new Set(ctx.transcript.mcpErrors);
    if (!servers.length && !errors.size) return null;
    const label = withLabel(o.label, "MCP");
    const segs = label ? [api.seg(`${label} `, { fg: "muted" })] : [];
    const all = [...new Set([...servers, ...errors])].slice(0, o.max);
    all.forEach((s, i) => {
      if (i > 0) segs.push(api.seg(" "));
      if (errors.has(s)) segs.push(api.seg("⚠ ", { fg: "crit" }));
      segs.push(api.seg(sanitizeDisplayText(s), { fg: errors.has(s) ? "crit" : "fg" }));
    });
    return segs;
  },
});
