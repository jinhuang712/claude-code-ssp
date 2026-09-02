import { defineWidget } from "../core/types.js";
import { labelSchema, stdin, withLabel } from "./_shared.js";

export const tokensSession = defineWidget<{ label: string | null; breakdown: boolean; style: "words" | "arrows" }>({
  id: "tokens.session",
  name: "Session tokens",
  description: "Cumulative tokens this session, with optional in/out/cache breakdown.",
  category: "usage",
  sample: "Tokens 3.0M (↓80k ↑50k ⟲417k)",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Tokens" },
      breakdown: { type: "boolean", default: true, title: "Show in/out/cache breakdown" },
      style: { type: "string", enum: ["words", "arrows"], default: "words", title: "Breakdown style", description: "words: in/out/cache · arrows: ↓ ↑ ⟲" },
    },
  },
  defaults: { label: "Tokens", breakdown: true, style: "words" },
  render(ctx, o, api) {
    const t = ctx.transcript.sessionTokens;
    if (!t) return null;
    const cache = t.cacheCreationTokens + t.cacheReadTokens;
    const total = t.inputTokens + t.outputTokens + cache;
    if (total <= 0) return null;
    const label = withLabel(o.label, "Tokens");
    const segs = label ? [api.seg(`${label} `, { fg: "muted" })] : [];
    segs.push(api.seg(api.tokens(total), { fg: "fg" }));
    if (o.breakdown) {
      const parts =
        o.style === "arrows"
          ? [`↓${api.tokens(t.inputTokens)}`, `↑${api.tokens(t.outputTokens)}`, ...(cache ? [`⟲${api.tokens(cache)}`] : [])]
          : [`in: ${api.tokens(t.inputTokens)}`, `out: ${api.tokens(t.outputTokens)}`, ...(cache ? [`cache: ${api.tokens(cache)}`] : [])];
      segs.push(api.seg(` (${parts.join(o.style === "arrows" ? " " : ", ")})`, { fg: "muted" }));
    }
    return segs;
  },
});

export const tokensCurrent = defineWidget<{ label: string | null }>({
  id: "tokens.current",
  name: "Current context tokens",
  description: "Tokens in the current context window (from the latest API response).",
  category: "context",
  sample: "ctx 84k",
  schema: { type: "object", properties: { label: { ...labelSchema, default: "ctx" } } },
  defaults: { label: "ctx" },
  render(ctx, o, api) {
    const cw = stdin(ctx).context_window;
    const u = cw?.current_usage;
    if (!u) return null;
    const n = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    if (n <= 0) return null;
    const label = withLabel(o.label, "ctx");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(api.tokens(n))];
  },
});

export const tokensSpeed = defineWidget<{ label: string | null }>({
  id: "tokens.outputSpeed",
  name: "Output speed",
  description: "Output tokens per second (needs two consecutive renders during streaming).",
  category: "usage",
  sample: "42 tok/s",
  schema: { type: "object", properties: { label: { ...labelSchema, default: null } } },
  defaults: { label: null },
  render(ctx, o, api) {
    const speed = (ctx as unknown as { outputSpeed?: number | null }).outputSpeed;
    if (typeof speed !== "number") return null;
    const label = withLabel(o.label, "");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(`${speed.toFixed(speed < 10 ? 1 : 0)} tok/s`, { fg: "muted" })];
  },
});
