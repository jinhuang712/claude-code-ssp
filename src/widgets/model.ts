import { defineWidget } from "../core/types.js";
import { formatModelName, getModelName, getProviderLabel, type ModelFormatMode } from "../data/stdin.js";
import { stdin } from "./_shared.js";

export const modelBadge = defineWidget<{ format: ModelFormatMode; brackets: boolean; showEffort: boolean; showProvider: boolean; showFastMode: boolean }>({
  id: "model.badge",
  name: "Model badge",
  description: "Current model, optionally with effort level, provider and fast mode.",
  category: "model",
  sample: "[Sonnet 5 ◕ xhigh]",
  schema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["full", "compact", "short"], default: "full", title: "Name format" },
      brackets: { type: "boolean", default: true, title: "Wrap in [ ]" },
      showEffort: { type: "boolean", default: true, title: "Show effort level" },
      showProvider: { type: "boolean", default: false, title: "Show provider (Bedrock/Vertex/…)" },
      showFastMode: { type: "boolean", default: true, title: "Show ⚡ when fast mode is on" },
    },
  },
  defaults: { format: "full", brackets: true, showEffort: true, showProvider: false, showFastMode: true },
  render(ctx, o, api) {
    const s = stdin(ctx);
    const name = formatModelName(getModelName(s), o.format);
    if (!name) return null;
    const parts: string[] = [];
    if (o.showProvider) {
      const provider = getProviderLabel(s);
      if (provider) parts.push(provider);
    }
    parts.push(name);
    if (o.showEffort && ctx.effortLevel) parts.push(`${ctx.effortSymbol ?? ""} ${ctx.effortLevel}`.trim());
    if (o.showFastMode && s.fast_mode) parts.push("⚡");
    const body = parts.join(" ");
    return [api.seg(o.brackets ? `[${body}]` : body, { fg: "model" })];
  },
});

export const modelEffort = defineWidget<{ symbolOnly: boolean }>({
  id: "model.effort",
  name: "Effort level",
  description: "Reasoning effort as a symbol and/or word.",
  category: "model",
  sample: "◕ xhigh",
  schema: { type: "object", properties: { symbolOnly: { type: "boolean", default: false, title: "Symbol only" } } },
  defaults: { symbolOnly: false },
  render(ctx, o, api) {
    if (!ctx.effortLevel) return null;
    const text = o.symbolOnly ? (ctx.effortSymbol || ctx.effortLevel) : `${ctx.effortSymbol ?? ""} ${ctx.effortLevel}`.trim();
    return [api.seg(text, { fg: "model" })];
  },
});

export const modelVersion = defineWidget<{ prefix: string }>({
  id: "model.claudeVersion",
  name: "Claude Code version",
  description: "Claude Code version reported on stdin.",
  category: "environment",
  sample: "v2.1.258",
  schema: { type: "object", properties: { prefix: { type: "string", default: "v", title: "Prefix" } } },
  defaults: { prefix: "v" },
  render(ctx, o, api) {
    const v = stdin(ctx).version;
    return v ? [api.seg(`${o.prefix}${v}`, { fg: "muted" })] : null;
  },
});
