import { defineWidget } from "../core/types.js";
import { getContextPercent, getTotalTokens } from "../data/stdin.js";
import { formatTokens } from "../core/api.js";
import { labelSchema, stdin, thresholdSchema, withLabel } from "./_shared.js";

type ValueMode = "percent" | "tokens" | "remaining" | "both";

function valueText(ctx: Parameters<typeof getContextPercent>[0], pct: number, mode: ValueMode): string {
  const size = ctx.context_window?.context_window_size ?? 200_000;
  const used = getTotalTokens(ctx);
  switch (mode) {
    case "tokens":
      return `${formatTokens(used)}/${formatTokens(size)}`;
    case "remaining":
      return `${Math.max(0, 100 - pct)}% left`;
    case "both":
      return `${pct}% (${formatTokens(used)}/${formatTokens(size)})`;
    default:
      return `${pct}%`;
  }
}

export const contextBar = defineWidget<{ label: string | null; width: number; value: ValueMode; warnAt: number; critAt: number; autoCompactWindow: number | null }>({
  id: "context.bar",
  name: "Context bar",
  description: "Context window usage as a progress bar with threshold colors.",
  category: "context",
  sample: "Context ███░░░░░░░ 32%",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Context" },
      width: { type: "integer", default: 10, minimum: 3, maximum: 40, title: "Bar width" },
      value: { type: "string", enum: ["percent", "tokens", "remaining", "both"], default: "percent", title: "Value format" },
      ...thresholdSchema(70, 85),
      autoCompactWindow: { type: ["integer", "null"], default: null, title: "Autocompact window (tokens)", description: "Compute % against this window instead of the full model window, to match /context." },
    },
  },
  defaults: { label: "Context", width: 10, value: "percent", warnAt: 70, critAt: 85, autoCompactWindow: null },
  numeric: (ctx, o) => getContextPercent(ctx.stdin, o.autoCompactWindow),
  render(ctx, o, api) {
    const s = stdin(ctx);
    if (!s.context_window) return null;
    const pct = getContextPercent(s, o.autoCompactWindow);
    const lvl = api.level(pct, o.warnAt, o.critAt);
    const label = withLabel(o.label, "Context");
    const segs = [];
    if (label) segs.push(api.seg(`${label} `, { fg: "muted" }));
    segs.push(api.seg(api.bar(pct, o.width), { fg: lvl === "ok" ? "context" : lvl }));
    segs.push(api.seg(` ${valueText(s, pct, o.value)}`, { fg: lvl === "ok" ? "fg" : lvl, bold: lvl === "crit" }));
    return segs;
  },
});

export const contextPercent = defineWidget<{ label: string | null; value: ValueMode; warnAt: number; critAt: number }>({
  id: "context.value",
  name: "Context value",
  description: "Context usage as text only (no bar).",
  category: "context",
  sample: "ctx 32%",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "ctx" },
      value: { type: "string", enum: ["percent", "tokens", "remaining", "both"], default: "percent" },
      ...thresholdSchema(70, 85),
    },
  },
  defaults: { label: "ctx", value: "percent", warnAt: 70, critAt: 85 },
  numeric: (ctx) => getContextPercent(ctx.stdin),
  render(ctx, o, api) {
    const s = stdin(ctx);
    if (!s.context_window) return null;
    const pct = getContextPercent(s);
    const lvl = api.level(pct, o.warnAt, o.critAt);
    const label = withLabel(o.label, "ctx");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(valueText(s, pct, o.value), { fg: lvl === "ok" ? "fg" : lvl })];
  },
});

export const contextCompactions = defineWidget<{ label: string | null }>({
  id: "context.compactions",
  name: "Compactions",
  description: "Number of /compact or auto-compact events this session (hidden until the first one).",
  category: "context",
  sample: "⟳2",
  schema: { type: "object", properties: { label: { ...labelSchema, default: "⟳" } } },
  defaults: { label: "⟳" },
  render(ctx, o, api) {
    const n = ctx.transcript.compactionCount ?? 0;
    if (n <= 0) return null;
    return [api.seg(`${withLabel(o.label, "⟳") ?? ""}${n}`, { fg: "muted" })];
  },
});

export const promptCache = defineWidget<{ label: string | null; showHitRatio: boolean }>({
  id: "context.promptCache",
  name: "Prompt cache",
  description: "Whether the prompt cache is warm and when it expires.",
  category: "context",
  sample: "cache ● 42m",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "cache" },
      showHitRatio: { type: "boolean", default: false, title: "Show hit ratio" },
    },
  },
  defaults: { label: "cache", showHitRatio: false },
  render(ctx, o, api) {
    const pc = stdin(ctx).prompt_cache;
    const label = withLabel(o.label, "cache");
    const segs = label ? [api.seg(`${label} `, { fg: "muted" })] : [];
    if (pc) {
      if (!pc.caching_observed) return null;
      if (pc.warm && pc.expires_at) {
        const remaining = pc.expires_at * 1000 - ctx.now;
        segs.push(api.seg("●", { fg: remaining < 60_000 ? "warn" : "ok" }), api.seg(` ${api.duration(Math.max(0, remaining))}`, { fg: "fg" }));
      } else {
        segs.push(api.seg("○ cold", { fg: "muted" }));
      }
      if (o.showHitRatio && typeof pc.hit_ratio === "number") segs.push(api.seg(` ${Math.round(pc.hit_ratio * 100)}%`, { fg: "muted" }));
      return segs;
    }
    // Fallback: transcript-derived anchor (older Claude Code).
    const anchor = ctx.transcript.promptCacheAnchorAt;
    if (!anchor) return null;
    const ttl = (ctx.transcript.promptCacheTtlSeconds ?? 300) * 1000;
    const remaining = anchor.getTime() + ttl - ctx.now;
    if (remaining <= 0) return [...segs, api.seg("○ cold", { fg: "muted" })];
    return [...segs, api.seg("●", { fg: remaining < 60_000 ? "warn" : "ok" }), api.seg(` ${api.duration(remaining)}`)];
  },
});
