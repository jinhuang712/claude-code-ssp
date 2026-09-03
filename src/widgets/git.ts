import { defineWidget } from "../core/types.js";
import { stdin } from "./_shared.js";

export const gitBranch = defineWidget<{ showDirty: boolean; showAheadBehind: boolean; showFileStats: boolean; prefix: string; parens: boolean; link: boolean }>({
  id: "git.branch",
  name: "Git branch",
  description: "Branch with dirty marker, ahead/behind and file stats.",
  category: "git",
  sample: "git:(main*) ↑2 !3 +1",
  schema: {
    type: "object",
    properties: {
      prefix: { type: "string", default: "git:", title: "Prefix" },
      parens: { type: "boolean", default: true, title: "Branch in parentheses" },
      showDirty: { type: "boolean", default: true, title: "Show * when dirty" },
      showAheadBehind: { type: "boolean", default: true, title: "Show ↑N ↓N" },
      showFileStats: { type: "boolean", default: false, title: "Show !M +A ✘D ?U" },
      link: { type: "boolean", default: true, title: "Link branch to GitHub" },
    },
  },
  defaults: { prefix: "git:", parens: true, showDirty: true, showAheadBehind: true, showFileStats: false, link: true },
  render(ctx, o, api) {
    const g = ctx.gitStatus;
    if (!g) return null;
    const segs = [];
    const kind = g.vcs === "jj" ? "jj:" : o.prefix;
    if (kind) segs.push(api.seg(o.parens ? `${kind}(` : `${kind} `, { fg: "git" }));
    const branch = api.seg(`${g.branch}${o.showDirty && g.isDirty ? "*" : ""}`, { fg: "accent" });
    if (o.link && g.branchUrl) branch.link = g.branchUrl;
    segs.push(branch);
    if (g.conflict) segs.push(api.seg(" !conflict", { fg: "crit" }));
    if (kind && o.parens) segs.push(api.seg(")", { fg: "git" }));
    if (o.showAheadBehind && (g.ahead > 0 || g.behind > 0)) {
      const ab = [g.ahead > 0 ? `↑${g.ahead}` : "", g.behind > 0 ? `↓${g.behind}` : ""].filter(Boolean).join(" ");
      segs.push(api.seg(` ${ab}`, { fg: "muted" }));
    }
    if (o.showFileStats && g.fileStats) {
      const f = g.fileStats;
      const bits = [f.modified ? `!${f.modified}` : "", f.added ? `+${f.added}` : "", f.deleted ? `✘${f.deleted}` : "", f.untracked ? `?${f.untracked}` : ""].filter(Boolean);
      if (bits.length) segs.push(api.seg(` ${bits.join(" ")}`, { fg: "warn" }));
    }
    return segs;
  },
});

export const gitRepo = defineWidget<{ format: "owner/name" | "name" }>({
  id: "git.repo",
  name: "Repository",
  description: "owner/name parsed by Claude Code from the origin remote.",
  category: "git",
  sample: "jinhuang712/claude-code-ssp",
  schema: { type: "object", properties: { format: { type: "string", enum: ["owner/name", "name"], default: "owner/name" } } },
  defaults: { format: "owner/name" },
  render(ctx, o, api) {
    const r = stdin(ctx).workspace?.repo;
    if (!r?.name) return null;
    const text = o.format === "name" || !r.owner ? r.name : `${r.owner}/${r.name}`;
    const seg = api.seg(text, { fg: "git" });
    if (r.host && r.owner) seg.link = `https://${r.host}/${r.owner}/${r.name}`;
    return [seg];
  },
});

export const gitPr = defineWidget<{ showState: boolean }>({
  id: "git.pr",
  name: "Pull request",
  description: "Open PR/MR for the current branch with review state.",
  category: "git",
  sample: "#1234 ✓approved",
  schema: { type: "object", properties: { showState: { type: "boolean", default: true, title: "Show review state" } } },
  defaults: { showState: true },
  render(ctx, o, api) {
    const pr = stdin(ctx).pr;
    if (!pr?.number) return null;
    const stateGlyph: Record<string, string> = { approved: "✓", pending: "…", changes_requested: "✗", draft: "◌" };
    const stateColor: Record<string, string> = { approved: "ok", pending: "muted", changes_requested: "crit", draft: "muted" };
    const segs = [api.seg(`${pr.kind === "mr" ? "!" : "#"}${pr.number}`, { fg: "accent" })];
    if (pr.url) segs[0]!.link = pr.url;
    if (o.showState && pr.review_state) {
      segs.push(api.seg(` ${stateGlyph[pr.review_state] ?? ""}${pr.review_state.replace("_", " ")}`, { fg: stateColor[pr.review_state] ?? "muted" }));
    }
    return segs;
  },
});

export const gitLines = defineWidget<{ source: "session" | "worktree"; hideZero: boolean }>({
  id: "git.linesChanged",
  name: "Lines changed",
  description: "Lines added/removed: either what this session edited (Claude Code's count) or what is uncommitted in the worktree (git diff HEAD).",
  category: "git",
  sample: "+156 -23",
  schema: {
    type: "object",
    properties: {
      source: { type: "string", enum: ["session", "worktree"], default: "session", title: "Count" },
      hideZero: { type: "boolean", default: true, title: "Hide when both are zero" },
    },
  },
  defaults: { source: "session", hideZero: true },
  render(ctx, o, api) {
    let add = 0;
    let del = 0;
    if (o.source === "worktree") {
      const d = ctx.gitStatus?.lineDiff;
      if (!d) return null;
      add = d.added;
      del = d.deleted;
    } else {
      const c = stdin(ctx).cost;
      add = c?.total_lines_added ?? 0;
      del = c?.total_lines_removed ?? 0;
    }
    if (o.hideZero && !add && !del) return null;
    return [api.seg(`+${add}`, { fg: "ok" }), api.seg(" "), api.seg(`-${del}`, { fg: "crit" })];
  },
});
