import { defineWidget } from "../core/types.js";
import { formatModelName, getModelName, getProviderLabel, type ModelFormatMode } from "../data/stdin.js";
import { stdin } from "./_shared.js";

type EffortStyle = "symbol-word" | "word" | "symbol";
type Joiner = "space" | "dot";

function windowLabel(size: number | undefined): string | null {
  if (!size || size <= 0) return null;
  return size >= 1_000_000 ? `${Math.round(size / 100_000) / 10}M`.replace(".0M", "M") : `${Math.round(size / 1000)}k`;
}

/*
  Every option is one independent dimension; the badge is their combination:
    which parts        showWindow · showEffort · showProvider · showFastMode
    how effort reads   effortStyle (◕ low / low / ◕)
    how parts join     joiner (space / ·), effortParens (low → (low))
    outer wrapper      brackets
*/
export const modelBadge = defineWidget<{
  format: ModelFormatMode;
  brackets: boolean;
  joiner: Joiner;
  effortParens: boolean;
  effortStyle: EffortStyle;
  showWindow: boolean;
  showEffort: boolean;
  showProvider: boolean;
  showFastMode: boolean;
}>({
  id: "model.badge",
  name: "Model badge",
  description: "Current model, optionally with effort level, provider and fast mode.",
  category: "model",
  sample: "[Sonnet 5 ◕ xhigh]",
  schema: {
    type: "object",
    properties: {
      format: { type: "string", enum: ["full", "compact", "short"], default: "full", title: "Name format" },
      showWindow: { type: "boolean", default: false, title: "Append context window size, e.g. (1M)" },
      showEffort: { type: "boolean", default: true, title: "Show effort level" },
      effortStyle: { type: "string", enum: ["symbol-word", "word", "symbol"], default: "symbol-word", title: "Effort style" },
      effortParens: { type: "boolean", default: false, title: "Effort in parentheses" },
      showProvider: { type: "boolean", default: false, title: "Show provider (Bedrock/Vertex/…)" },
      showFastMode: { type: "boolean", default: true, title: "Show ⚡ when fast mode is on" },
      joiner: { type: "string", enum: ["space", "dot"], default: "space", title: "Join parts with" },
      brackets: { type: "boolean", default: true, title: "Wrap in [ ]" },
    },
  },
  defaults: { format: "full", brackets: true, joiner: "space", effortParens: false, effortStyle: "symbol-word", showWindow: false, showEffort: true, showProvider: false, showFastMode: true },
  render(ctx, o, api) {
    const s = stdin(ctx);
    let name = formatModelName(getModelName(s), o.format);
    if (!name) return null;
    if (o.showWindow) {
      const w = windowLabel(s.context_window?.context_window_size);
      if (w) name = `${name} (${w})`;
    }
    const parts: string[] = [];
    if (o.showProvider) {
      const provider = getProviderLabel(s);
      if (provider) parts.push(provider);
    }
    parts.push(name);
    if (o.showEffort && ctx.effortLevel) {
      const sym = ctx.effortSymbol ?? "";
      const effort = o.effortStyle === "word" ? ctx.effortLevel : o.effortStyle === "symbol" ? sym || ctx.effortLevel : `${sym} ${ctx.effortLevel}`.trim();
      parts.push(o.effortParens ? `(${effort})` : effort);
    }
    if (o.showFastMode && s.fast_mode) parts.push("⚡");
    // Provider and name always sit next to each other with a space; the joiner is for the rest.
    const head = parts.slice(0, o.showProvider && parts.length > 1 && parts[0] !== name ? 2 : 1).join(" ");
    const rest = parts.slice(o.showProvider && parts[0] !== name ? 2 : 1);
    const body = [head, ...rest].join(o.joiner === "dot" ? " · " : " ");
    return [api.seg(o.brackets ? `[${body}]` : body, { fg: "model" })];
  },
});

export const modelEffort = defineWidget<{ symbolOnly?: boolean; effortStyle: EffortStyle }>({
  id: "model.effort",
  name: "Effort level",
  description: "Reasoning effort as a symbol and/or word.",
  category: "model",
  sample: "◕ xhigh",
  schema: { type: "object", properties: { effortStyle: { type: "string", enum: ["symbol-word", "word", "symbol"], default: "symbol-word", title: "Effort style" } } },
  defaults: { effortStyle: "symbol-word" },
  render(ctx, o, api) {
    if (!ctx.effortLevel) return null;
    const style: EffortStyle = o.symbolOnly ? "symbol" : o.effortStyle;
    const sym = ctx.effortSymbol ?? "";
    const text = style === "word" ? ctx.effortLevel : style === "symbol" ? sym || ctx.effortLevel : `${sym} ${ctx.effortLevel}`.trim();
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
