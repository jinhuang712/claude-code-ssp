import type { StdinData } from "../data/types.js";
import type { Ctx, JsonSchema } from "../core/types.js";

/** Fields Claude Code ≥ 2.1.251 sends that the harvested StdinData type does not declare yet. */
export interface StdinExtras {
  session_name?: string;
  version?: string;
  output_style?: { name?: string } | null;
  fast_mode?: boolean;
  thinking?: { enabled?: boolean } | null;
  vim?: { mode?: string } | null;
  agent?: { name?: string } | null;
  exceeds_200k_tokens?: boolean;
  prompt_cache?: {
    warm?: boolean;
    caching_observed?: boolean;
    ttl?: string;
    expires_at?: number | null;
    requests?: number;
    misses?: number;
    hit_ratio?: number | null;
  } | null;
  pr?: { number?: number; url?: string; review_state?: string; kind?: string } | null;
  worktree?: { name?: string; path?: string; branch?: string } | null;
  workspace?: StdinData["workspace"] & {
    repo?: { host?: string; owner?: string; name?: string } | null;
  };
  rate_limits?: StdinData["rate_limits"] & {
    spend_limit?: { used_percentage?: number; resets_at?: number } | null;
  };
}

export type Stdin = StdinData & StdinExtras;

export function stdin(ctx: Ctx): Stdin {
  return ctx.stdin as Stdin;
}

export const labelSchema: JsonSchema = {
  type: ["string", "null"],
  title: "Label",
  description: "Text shown before the value. Empty hides the label.",
  default: null,
};

export function withLabel(label: string | null | undefined, fallback: string): string | null {
  if (label === undefined) return fallback;
  if (label === null || label === "") return null;
  return label;
}

export type ColorMode = "thresholds" | "gradient";

/** Resolve the colour for a percentage: theme token below the thresholds, or a computed gradient hex. */
export function pctColor(mode: ColorMode, pct: number, lvl: "ok" | "warn" | "crit", okToken: string, api: { gradient(p: number): string }): string {
  if (mode === "gradient") return api.gradient(pct);
  return lvl === "ok" ? okToken : lvl;
}

export function thresholdSchema(warn: number, crit: number): Record<string, JsonSchema> {
  return {
    colorMode: { type: "string", enum: ["thresholds", "gradient"], default: "thresholds", title: "Colour" },
    warnAt: { type: "integer", title: "Warn at %", minimum: 0, maximum: 100, default: warn },
    critAt: { type: "integer", title: "Critical at %", minimum: 0, maximum: 100, default: crit },
  };
}
