/**
 * The render engine: config + ctx → ANSI lines.
 * Each line has left / center / right zones; right is anchored to the terminal edge.
 */
import { detectColorLevel, renderSegments, truncateVisual, visualWidth } from "./ansi.js";
import { createApi } from "./api.js";
import { getWidget } from "./registry.js";
import { resolveTheme } from "./theme.js";
import type { ColorLevel, Ctx, FooterConfig, LineConfig, RenderResult, Segment, Style, WidgetInstance, Zone } from "./types.js";

interface RenderedWidget {
  text: string;
  width: number;
}

function mergeStyle(base: Style | undefined, override: Style | undefined): Style | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

function applyOverride(segs: Segment[], override: Style | undefined): Segment[] {
  if (!override) return segs;
  return segs.map((s) => ({ ...s, style: mergeStyle(s.style, override) }));
}

function renderInstance(
  inst: WidgetInstance,
  ctx: Ctx,
  level: Exclude<ColorLevel, "auto">,
  errors: RenderResult["errors"],
): RenderedWidget | null {
  const def = getWidget(inst.widget);
  const api = createApi(ctx.theme, ctx.now);
  if (!def) {
    errors.push({ widget: inst.widget, message: "unknown widget" });
    const text = renderSegments([{ text: `⚠ ${inst.widget}`, style: { fg: "muted", dim: true } }], ctx.theme, level);
    return { text, width: visualWidth(text) };
  }
  try {
    const opts = { ...def.defaults, ...(inst.options ?? {}) };
    if (inst.label !== undefined) (opts as Record<string, unknown>).label = inst.label;
    const out = def.render(ctx, opts, api);
    if (out === null || out === undefined) return null;
    const segs = typeof out === "string" ? [{ text: out }] : out;
    if (segs.length === 0 || segs.every((s) => s.text === "")) return null;
    const text = renderSegments(applyOverride(segs, inst.style), ctx.theme, level);
    return { text, width: visualWidth(text) };
  } catch (err) {
    errors.push({ widget: inst.widget, message: err instanceof Error ? err.message : String(err) });
    const text = renderSegments([{ text: `⚠ ${inst.widget}`, style: { fg: "crit", dim: true } }], ctx.theme, level);
    return { text, width: visualWidth(text) };
  }
}

function renderZone(items: WidgetInstance[] | undefined, ctx: Ctx, level: Exclude<ColorLevel, "auto">, separator: string, errors: RenderResult["errors"]): RenderedWidget {
  const rendered = (items ?? []).map((i) => renderInstance(i, ctx, level, errors)).filter((r): r is RenderedWidget => r !== null);
  if (rendered.length === 0) return { text: "", width: 0 };
  const sepStyled = renderSegments([{ text: separator, style: { fg: "muted" } }], ctx.theme, level);
  const text = rendered.map((r) => r.text).join(sepStyled);
  const width = rendered.reduce((w, r) => w + r.width, 0) + visualWidth(separator) * (rendered.length - 1);
  return { text, width };
}

function pad(n: number): string {
  return n > 0 ? " ".repeat(n) : "";
}

/** Lay out one line's zones into 1+ physical rows. */
export function layoutLine(zones: Record<Zone, RenderedWidget>, columns: number, overflow: LineConfig["overflow"] = "wrap"): string[] {
  const { left, center, right } = zones;
  const parts = [left, center, right].filter((z) => z.width > 0);
  if (parts.length === 0) return [];
  if (parts.length === 1) {
    const only = parts[0]!;
    if (only === right && columns > 0 && right.width <= columns) return [pad(columns - right.width) + right.text];
    if (only === center && columns > 0 && center.width <= columns) return [pad(Math.floor((columns - center.width) / 2)) + center.text];
    return [only.text];
  }
  const gaps = parts.length - 1; // at least one space between zones
  const needed = left.width + center.width + right.width + gaps;
  if (columns <= 0 || needed <= columns) {
    if (columns <= 0) return [parts.map((p) => p.text).join(" ")];
    let row = left.text;
    let cursor = left.width;
    if (center.width > 0) {
      const ideal = Math.floor((columns - center.width) / 2);
      const minStart = cursor + (cursor > 0 ? 1 : 0);
      const maxStart = columns - center.width - (right.width > 0 ? right.width + 1 : 0);
      const start = Math.max(minStart, Math.min(ideal, maxStart));
      row += pad(start - cursor) + center.text;
      cursor = start + center.width;
    }
    if (right.width > 0) {
      row += pad(columns - right.width - cursor) + right.text;
    }
    return [row];
  }
  // Overflow.
  switch (overflow) {
    case "drop-right":
      return layoutLine({ left, center, right: { text: "", width: 0 } }, columns, "truncate");
    case "truncate": {
      const joined = [left, center, right].filter((z) => z.width > 0).map((z) => z.text).join(" ");
      return [truncateVisual(joined, columns)];
    }
    case "wrap":
    default: {
      const first = layoutLine({ left, center, right: { text: "", width: 0 } }, columns, "truncate");
      const second = right.width <= columns ? pad(columns - right.width) + right.text : truncateVisual(right.text, columns);
      return [...first, second];
    }
  }
}

export function render(config: FooterConfig, ctx: Omit<Ctx, "theme">): RenderResult {
  const started = performance.now();
  const theme = resolveTheme(config.theme);
  const level = config.colorLevel === "auto" ? detectColorLevel() : config.colorLevel;
  const fullCtx: Ctx = { ...ctx, theme };
  const errors: RenderResult["errors"] = [];
  const lines: string[] = [];
  for (const line of config.lines) {
    if (line.minColumns && ctx.columns > 0 && ctx.columns < line.minColumns) continue;
    const sep = line.separator ?? config.separator;
    const zones: Record<Zone, RenderedWidget> = {
      left: renderZone(line.left, fullCtx, level, sep, errors),
      center: renderZone(line.center, fullCtx, level, sep, errors),
      right: renderZone(line.right, fullCtx, level, sep, errors),
    };
    lines.push(...layoutLine(zones, ctx.columns, line.overflow));
  }
  return { lines, errors, ms: performance.now() - started };
}
