import { defineWidget } from "../core/types.js";
import { formatUsd, resolveSessionCost } from "../data/cost.js";
import { labelSchema, stdin, withLabel } from "./_shared.js";

export const costSession = defineWidget<{ label: string | null; allowRoutedCost: boolean; showSource: boolean }>({
  id: "cost.session",
  name: "Session cost",
  description: "Claude Code's native cost.total_cost_usd, falling back to a price-table estimate.",
  category: "cost",
  sample: "Cost $1.27",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Cost" },
      allowRoutedCost: { type: "boolean", default: false, title: "Show cost on Bedrock/Vertex too" },
      showSource: { type: "boolean", default: false, title: "Mark estimates with ≈" },
    },
  },
  defaults: { label: "Cost", allowRoutedCost: false, showSource: false },
  render(ctx, o, api) {
    const c = resolveSessionCost(stdin(ctx), ctx.transcript.sessionTokens, { allowRoutedCost: o.allowRoutedCost });
    if (!c) return null;
    const label = withLabel(o.label, "Cost");
    const prefix = o.showSource && c.source === "estimate" ? "≈" : "";
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(`${prefix}${formatUsd(c.totalUsd)}`)];
  },
});

export const costApiTime = defineWidget<{ label: string | null }>({
  id: "cost.apiTime",
  name: "API time",
  description: "Total time spent waiting on the API this session.",
  category: "cost",
  sample: "api 2m 18s",
  schema: { type: "object", properties: { label: { ...labelSchema, default: "api" } } },
  defaults: { label: "api" },
  render(ctx, o, api) {
    const ms = stdin(ctx).cost?.total_api_duration_ms;
    if (!ms) return null;
    const label = withLabel(o.label, "api");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(api.duration(ms))];
  },
});
