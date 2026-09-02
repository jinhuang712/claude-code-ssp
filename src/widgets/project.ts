import * as os from "node:os";
import { defineWidget } from "../core/types.js";
import { sanitizeDisplayText } from "../data/utils/sanitize.js";
import { stdin } from "./_shared.js";

function formatPath(cwd: string, levels: "1" | "2" | "3" | "full" | "tilde"): string {
  const safe = sanitizeDisplayText(cwd);
  if (levels === "full") return safe;
  if (levels === "tilde") {
    const home = os.homedir();
    return safe.startsWith(home) ? `~${safe.slice(home.length)}` : safe;
  }
  const segs = safe.split(/[\\/]/).filter(Boolean);
  return segs.slice(-Number(levels)).join("/") || safe;
}

export const projectPath = defineWidget<{ levels: "1" | "2" | "3" | "full" | "tilde"; link: boolean; icon: string }>({
  id: "project.path",
  name: "Project path",
  description: "Working directory, as basename, N trailing segments, ~-relative or full path.",
  category: "project",
  sample: "~/dev/claude-code-ssp",
  schema: {
    type: "object",
    properties: {
      levels: { type: "string", enum: ["1", "2", "3", "tilde", "full"], default: "1", title: "Path depth" },
      link: { type: "boolean", default: true, title: "Clickable (OSC 8 file link)" },
      icon: { type: "string", default: "", title: "Icon prefix" },
    },
  },
  defaults: { levels: "1", link: true, icon: "" },
  render(ctx, o, api) {
    const s = stdin(ctx);
    const cwd = s.workspace?.current_dir ?? s.cwd;
    if (!cwd) return null;
    const text = `${o.icon ? `${o.icon} ` : ""}${formatPath(cwd, o.levels)}`;
    const seg = api.seg(text, { fg: "project" });
    if (o.link) seg.link = `file://${encodeURI(cwd)}`;
    return [seg];
  },
});

export const projectAddedDirs = defineWidget<{ max: number }>({
  id: "project.addedDirs",
  name: "Added directories",
  description: "Directories added with /add-dir.",
  category: "project",
  sample: "+lib-foo +shared",
  schema: { type: "object", properties: { max: { type: "integer", default: 3, minimum: 1, title: "Max shown" } } },
  defaults: { max: 3 },
  render(ctx, o, api) {
    const dirs = stdin(ctx).workspace?.added_dirs ?? [];
    if (!dirs.length) return null;
    const shown = dirs.slice(0, o.max).map((d) => `+${sanitizeDisplayText(d.split(/[\\/]/).filter(Boolean).pop() ?? d)}`);
    const more = dirs.length - shown.length;
    return [api.seg(shown.join(" ") + (more > 0 ? ` +${more} more` : ""), { fg: "muted" })];
  },
});

export const projectWorktree = defineWidget<Record<string, never>>({
  id: "project.worktree",
  name: "Worktree",
  description: "Name of the active git worktree session.",
  category: "project",
  sample: "⎇ my-feature",
  schema: { type: "object", properties: {} },
  defaults: {},
  render(ctx, _o, api) {
    const s = stdin(ctx);
    const name = s.worktree?.name ?? s.workspace?.git_worktree;
    return name ? [api.seg(`⎇ ${sanitizeDisplayText(name)}`, { fg: "git" })] : null;
  },
});

export const projectSessionName = defineWidget<Record<string, never>>({
  id: "project.sessionName",
  name: "Session name",
  description: "Custom or AI-generated session title.",
  category: "session",
  sample: "refactor-auth",
  schema: { type: "object", properties: {} },
  defaults: {},
  render(ctx, _o, api) {
    const name = stdin(ctx).session_name ?? ctx.transcript.sessionName;
    return name ? [api.seg(sanitizeDisplayText(name), { fg: "accent" })] : null;
  },
});
