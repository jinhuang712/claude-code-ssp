import { defineWidget } from "../core/types.js";
import { formatModelName, getModelName, getProviderLabel, type ModelFormatMode } from "../data/stdin.js";
import { stdin } from "./_shared.js";

type Layout = "bracket" | "plain" | "dot" | "paren";
type EffortStyle = "symbol-word" | "word" | "symbol";

function windowLabel(size: number | undefined): string | null {
  if (!size || size <= 0) return null;
  return size >= 1_000_000 ? `${Math.round(size / 100_000) / 10}M`.replace(".0M", "M") : `${Math.round(size / 1000)}k`;
}

export const modelBadge = defineWidget<{ format: ModelFormatMode; layout: Layout; effortStyle: EffortStyle; showWindow: boolean; brackets?: boolean; showEffort: boolean; showProvider: boolean; showFastMode: boolean }>({
  id: "model.badge",
  name: "Model badge",
  description: "Current model, optionally with effort level, provider and fast mode.",
  category: "model",
  sample: "[Sonnet 5 ◕ xhigh]",
  schema: {
    type: "object",
    properties: {
      layout: { type: "string", enum: ["bracket", "plain", "dot", "paren"], default: "bracket", title: "Layout" },
      format: { type: "string", enum: ["full", "compact", "short"], default: "full", title: "Name format" },
      showWindow: { type: "boolean", default: false, title: "Append context window size, e.g. (1M)" },
      showEffort: { type: "boolean", default: true, title: "Show effort level" },
      effortStyle: { type: "string", enum: ["symbol-word", "word", "symbol"], default: "symbol-word", title: "Effort style" },
      showProvider: { type: "boolean", default: false, title: "Show provider (Bedrock/Vertex/…)" },
      showFastMode: { type: "boolean", default: true, title: "Show ⚡ when fast mode is on" },
    },
  },
  defaults: { layout: "bracket", format: "full", showWindow: false, showEffort: true, effortStyle: "symbol-word", showProvider: false, showFastMode: true },
  render(ctx, o, api) {
    const s = stdin(ctx);
    let name = formatModelName(getModelName(s), o.format);
    if (!name) return null;
    // Older configs used brackets:false; honour it as the plain layout.
    const layout: Layout = o.brackets === false && o.layout === "bracket" ? "plain" : o.layout;
    if (o.showWindow) {
      const w = windowLabel(s.context_window?.context_window_size);
      if (w) name = `${name} (${w})`;
    }
    const head: string[] = [];
    if (o.showProvider) {
      const provider = getProviderLabel(s);
      if (provider) head.push(provider);
    }
    head.push(name);
    let effort: string | null = null;
    if (o.showEffort && ctx.effortLevel) {
      const sym = ctx.effortSymbol ?? "";
      effort = o.effortStyle === "word" ? ctx.effortLevel : o.effortStyle === "symbol" ? sym || ctx.effortLevel : `${sym} ${ctx.effortLevel}`.trim();
    }
    const fast = o.showFastMode && s.fast_mode ? "⚡" : null;
    let body: string;
    switch (layout) {
      case "dot":
        body = [head.join(" "), effort, fast].filter(Boolean).join(" · ");
        break;
      case "paren": {
        const tail = [effort, fast].filter(Boolean).join(" ");
        body = tail ? `${head.join(" ")} (${tail})` : head.join(" ");
        break;
      }
      case "plain":
        body = [...head, effort, fast].filter(Boolean).join(" ");
        break;
      default:
        body = `[${[...head, effort, fast].filter(Boolean).join(" ")}]`;
    }
    return [api.seg(body, { fg: "model" })];
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
