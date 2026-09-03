import { defineWidget } from "../core/types.js";
import { labelSchema, stdin, thresholdSchema, withLabel } from "./_shared.js";

type Window = { key: "5h" | "7d" | "spend"; pct: number | null; resetsAt: number | null };

function windows(ctx: Parameters<typeof stdin>[0]): Window[] {
  const rl = stdin(ctx).rate_limits;
  if (!rl) return [];
  const out: Window[] = [];
  if (rl.five_hour) out.push({ key: "5h", pct: rl.five_hour.used_percentage ?? null, resetsAt: rl.five_hour.resets_at ?? null });
  if (rl.seven_day) out.push({ key: "7d", pct: rl.seven_day.used_percentage ?? null, resetsAt: rl.seven_day.resets_at ?? null });
  if (rl.spend_limit) out.push({ key: "spend", pct: rl.spend_limit.used_percentage ?? null, resetsAt: rl.spend_limit.resets_at ?? null });
  return out;
}

/** "14:40" while the reset is today, "9/6 10:00" once it lands on another day (7-day windows usually do). */
function absoluteReset(when: number, now: number): string {
  const d = new Date(when);
  const n = new Date(now);
  const two = (x: number) => String(x).padStart(2, "0");
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export const usageWindows = defineWidget<{
  label: string | null;
  show5h: boolean;
  show7d: boolean;
  showSpend: boolean;
  bar: boolean;
  barWidth: number;
  showReset: boolean;
  resetFormat: "relative" | "absolute";
  value: "used" | "remaining";
  warnAt: number;
  critAt: number;
}>({
  id: "usage.windows",
  name: "Rate-limit windows",
  description: "5-hour / 7-day / spend-limit usage from Claude Code (Pro/Max).",
  category: "usage",
  sample: "Usage 5h ██░░░░░░░░ 23% (3h 41m) │ 7d ████░░░░░░ 41% (5d 2h)",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Usage" },
      show5h: { type: "boolean", default: true, title: "Show 5-hour window" },
      show7d: { type: "boolean", default: true, title: "Show 7-day window" },
      showSpend: { type: "boolean", default: true, title: "Show spend limit (if present)" },
      bar: { type: "boolean", default: false, title: "Progress bars" },
      barWidth: { type: "integer", default: 8, minimum: 3, maximum: 30, title: "Bar width" },
      showReset: { type: "boolean", default: true, title: "Show reset time" },
      resetFormat: { type: "string", enum: ["relative", "absolute"], default: "relative", title: "Reset time format" },
      value: { type: "string", enum: ["used", "remaining"], default: "used", title: "Value" },
      ...thresholdSchema(70, 90),
    },
  },
  defaults: { label: "Usage", show5h: true, show7d: true, showSpend: true, bar: false, barWidth: 8, showReset: true, resetFormat: "relative", value: "used", warnAt: 70, critAt: 90 },
  numeric: (ctx) => {
    const ws = windows(ctx).map((w) => w.pct ?? 0);
    return ws.length ? Math.max(...ws) : null;
  },
  render(ctx, o, api) {
    const ws = windows(ctx).filter((w) => (w.key === "5h" && o.show5h) || (w.key === "7d" && o.show7d) || (w.key === "spend" && o.showSpend));
    if (!ws.length) return null;
    const segs = [];
    const label = withLabel(o.label, "Usage");
    if (label) segs.push(api.seg(`${label} `, { fg: "muted" }));
    ws.forEach((w, i) => {
      if (i > 0) segs.push(api.seg(" │ ", { fg: "muted" }));
      const pct = w.pct ?? 0;
      const lvl = api.level(pct, o.warnAt, o.critAt);
      const shown = o.value === "remaining" ? Math.max(0, 100 - Math.round(pct)) : Math.round(pct);
      segs.push(api.seg(`${w.key} `, { fg: "muted" }));
      const resetTxt = w.resetsAt ? (o.resetFormat === "absolute" ? absoluteReset(w.resetsAt * 1000, ctx.now) : api.duration(Math.max(0, w.resetsAt * 1000 - ctx.now))) : null;
      if (pct >= 100 && resetTxt) {
        // A full bar says nothing new; the only useful fact now is when the window opens again.
        segs.push(api.seg(o.resetFormat === "absolute" ? `resets ${resetTxt}` : `resets in ${resetTxt}`, { fg: "crit", bold: true }));
        return;
      }
      if (o.bar) segs.push(api.seg(api.bar(pct, o.barWidth) + " ", { fg: lvl === "ok" ? "usage" : lvl }));
      segs.push(api.seg(`${shown}%`, { fg: lvl === "ok" ? "fg" : lvl, bold: lvl === "crit" }));
      if (o.showReset && resetTxt) segs.push(api.seg(` (${resetTxt})`, { fg: "muted" }));
    });
    return segs;
  },
});

export const usageSingle = defineWidget<{ window: "5h" | "7d"; label: string | null; warnAt: number; critAt: number }>({
  id: "usage.single",
  name: "Single rate-limit window",
  description: "Just one window as compact text, e.g. for a narrow zone.",
  category: "usage",
  sample: "5h 23%",
  schema: {
    type: "object",
    properties: {
      window: { type: "string", enum: ["5h", "7d"], default: "5h" },
      label: { ...labelSchema, default: null },
      ...thresholdSchema(70, 90),
    },
  },
  defaults: { window: "5h", label: null, warnAt: 70, critAt: 90 },
  render(ctx, o, api) {
    const w = windows(ctx).find((x) => x.key === o.window);
    if (!w) return null;
    const pct = Math.round(w.pct ?? 0);
    const lvl = api.level(pct, o.warnAt, o.critAt);
    const label = withLabel(o.label, o.window);
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(`${pct}%`, { fg: lvl === "ok" ? "fg" : lvl })];
  },
});
