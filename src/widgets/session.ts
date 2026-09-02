import { defineWidget } from "../core/types.js";
import { labelSchema, stdin, withLabel } from "./_shared.js";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export const sessionDuration = defineWidget<{ label: string | null; source: "transcript" | "stdin" }>({
  id: "session.duration",
  name: "Session duration",
  description: "Wall-clock time since the session started.",
  category: "session",
  sample: "⏱ 27m",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "⏱" },
      source: { type: "string", enum: ["transcript", "stdin"], default: "transcript", title: "Source", description: "transcript: first message timestamp · stdin: cost.total_duration_ms" },
    },
  },
  defaults: { label: "⏱", source: "transcript" },
  render(ctx, o, api) {
    let ms: number | null = null;
    if (o.source === "stdin") ms = stdin(ctx).cost?.total_duration_ms ?? null;
    else if (ctx.transcript.sessionStart) ms = ctx.now - ctx.transcript.sessionStart.getTime();
    if (ms === null || ms < 0) return null;
    const label = withLabel(o.label, "⏱");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(api.duration(ms))];
  },
});

export const sessionStarted = defineWidget<{ label: string | null; format: "datetime" | "time" }>({
  id: "session.started",
  name: "Session start",
  description: "When this session began.",
  category: "session",
  sample: "Started: 2026-09-02 23:15",
  schema: {
    type: "object",
    properties: {
      label: { ...labelSchema, default: "Started:" },
      format: { type: "string", enum: ["datetime", "time"], default: "datetime" },
    },
  },
  defaults: { label: "Started:", format: "datetime" },
  render(ctx, o, api) {
    const d = ctx.transcript.sessionStart;
    if (!d) return null;
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const text = o.format === "time" ? time : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`;
    const label = withLabel(o.label, "Started:");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(text)];
  },
});

export const sessionLastReply = defineWidget<{ label: string | null }>({
  id: "session.lastReply",
  name: "Last reply",
  description: "How long ago the assistant last responded.",
  category: "session",
  sample: "Last reply: 26m ago",
  schema: { type: "object", properties: { label: { ...labelSchema, default: "Last reply:" } } },
  defaults: { label: "Last reply:" },
  render(ctx, o, api) {
    const d = ctx.transcript.lastAssistantResponseAt;
    if (!d) return null;
    const label = withLabel(o.label, "Last reply:");
    return [...(label ? [api.seg(`${label} `, { fg: "muted" })] : []), api.seg(api.relative(d, ctx.now))];
  },
});

export const sessionClock = defineWidget<{ seconds: boolean }>({
  id: "session.clock",
  name: "Clock",
  description: "Current local time (set refreshInterval in settings for live updates).",
  category: "misc",
  sample: "23:41",
  schema: { type: "object", properties: { seconds: { type: "boolean", default: false, title: "Show seconds" } } },
  defaults: { seconds: false },
  render(ctx, o, api) {
    const d = new Date(ctx.now);
    const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}${o.seconds ? `:${pad2(d.getSeconds())}` : ""}`;
    return [api.seg(t, { fg: "muted" })];
  },
});

export const sessionVim = defineWidget<Record<string, never>>({
  id: "session.vimMode",
  name: "Vim mode",
  description: "Current vim mode (set hideVimModeIndicator in settings to avoid double display).",
  category: "session",
  sample: "-- INSERT --",
  schema: { type: "object", properties: {} },
  defaults: {},
  render(ctx, _o, api) {
    const mode = stdin(ctx).vim?.mode;
    if (!mode) return null;
    const color = mode === "INSERT" ? "ok" : mode.startsWith("VISUAL") ? "warn" : "accent";
    return [api.seg(`-- ${mode} --`, { fg: color, bold: true })];
  },
});

export const sessionAgent = defineWidget<Record<string, never>>({
  id: "session.agent",
  name: "Agent name",
  description: "Name of the agent when running with --agent.",
  category: "session",
  sample: "🤖 security-reviewer",
  schema: { type: "object", properties: {} },
  defaults: {},
  render(ctx, _o, api) {
    const name = stdin(ctx).agent?.name;
    return name ? [api.seg(`🤖 ${name}`, { fg: "accent" })] : null;
  },
});
