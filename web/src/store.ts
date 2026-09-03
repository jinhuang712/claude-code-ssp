import { create } from "zustand";
import { api, type ConfigLayer, type FooterConfig, type LineConfig, type RenderResult, type SampleMeta, type ThemeDef, type WidgetInstance, type WidgetManifest, type Zone } from "./api";

export interface Selection {
  line: number;
  zone: Zone;
  index: number;
}

export type PresetId = "minimal" | "standard" | "full";

export const PRESETS: Record<PresetId, { name: string; blurb: string; lines: LineConfig[] }> = {
  minimal: {
    name: "极简",
    blurb: "一行：项目 · 模型 · 上下文",
    lines: [{ left: [{ widget: "project.path" }, { widget: "git.branch" }], right: [{ widget: "model.badge" }, { widget: "context.value" }] }],
  },
  standard: {
    name: "标准",
    blurb: "两行：加上用量与费用",
    lines: [
      { left: [{ widget: "project.path" }, { widget: "git.branch" }], right: [{ widget: "model.badge" }, { widget: "cost.session" }] },
      { left: [{ widget: "usage.windows" }], right: [{ widget: "context.bar" }] },
    ],
  },
  full: {
    name: "完整",
    blurb: "四行：tokens、会话时间、agents、todos",
    lines: [
      { left: [{ widget: "project.path" }, { widget: "git.branch" }], right: [{ widget: "model.badge" }, { widget: "session.duration" }, { widget: "cost.session" }] },
      { left: [{ widget: "usage.windows" }], right: [{ widget: "context.bar" }] },
      { left: [{ widget: "tokens.session" }], right: [{ widget: "session.started" }, { widget: "session.lastReply" }] },
      { left: [{ widget: "activity.agents" }, { widget: "activity.todos" }] },
    ],
  },
};

interface State {
  loading: boolean;
  error: string | null;
  config: FooterConfig | null;
  saved: FooterConfig | null;
  layers: ConfigLayer[];
  widgets: WidgetManifest[];
  themes: ThemeDef[];
  samples: SampleMeta[];
  sampleId: string | null;
  columns: number;
  /** "auto" follows the preview's width; a number pins the column count to match a real terminal. */
  columnsMode: "auto" | number;
  preview: RenderResult | null;
  /** The column count the current preview was rendered for; the terminal only redraws when it matches. */
  previewColumns: number;
  selection: Selection | null;
  picker: { line: number; zone: Zone } | null;
  toast: string | null;
  saving: boolean;
  installed: boolean | null;
  advanced: boolean;

  init(): Promise<void>;
  setConfig(mutate: (c: FooterConfig) => void): void;
  setSample(id: string | null): void;
  setColumns(n: number): void;
  setColumnsMode(m: "auto" | number): void;
  select(sel: Selection | null): void;
  openPicker(line: number, zone: Zone): void;
  closePicker(): void;
  addWidget(line: number, zone: Zone, widget: string): void;
  removeAt(sel: Selection): void;
  moveWidget(from: Selection, toLine: number, toZone: Zone, toIndex?: number): void;
  reorder(line: number, zone: Zone, from: number, to: number): void;
  addLine(): void;
  removeLine(i: number): void;
  moveLine(i: number, dir: -1 | 1): void;
  updateAt(sel: Selection, mutate: (w: WidgetInstance) => void): void;
  applyPreset(id: PresetId): void;
  saveNow(scope?: "user" | "project"): Promise<void>;
  install(): Promise<void>;
  resetCounters(): Promise<void>;
  refreshPreview(): Promise<void>;
  setAdvanced(v: boolean): void;
  notify(msg: string | null): void;
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function zoneOf(line: LineConfig, zone: Zone): WidgetInstance[] {
  if (!line[zone]) line[zone] = [];
  return line[zone]!;
}

export const useStore = create<State>((set, get) => ({
  loading: true,
  error: null,
  config: null,
  saved: null,
  layers: [],
  widgets: [],
  themes: [],
  samples: [],
  sampleId: null,
  columns: Number(localStorage.getItem("ssp.columns") ?? 120),
  columnsMode: localStorage.getItem("ssp.columnsMode") === null || localStorage.getItem("ssp.columnsMode") === "auto" ? "auto" : Number(localStorage.getItem("ssp.columnsMode")),
  preview: null,
  previewColumns: 0,
  selection: null,
  picker: null,
  toast: null,
  saving: false,
  installed: null,
  advanced: localStorage.getItem("ssp.advanced") === "1",

  async init() {
    try {
      const [eff, widgets, themes, samples, plan] = await Promise.all([api.config(), api.widgets(), api.themes(), api.samples(), api.installPlan().catch(() => null)]);
      const live = samples.find((s) => s.source === "live");
      const sampleId = live?.id ?? samples[0]?.id ?? null;
      const prevCmd = (plan?.previous as { command?: string } | undefined)?.command ?? "";
      set({
        config: eff.config,
        saved: structuredClone(eff.config),
        layers: eff.layers,
        widgets,
        themes,
        samples,
        sampleId,
        installed: plan ? prevCmd.includes("claude-code-ssp") : null,
        loading: false,
      });
      void get().refreshPreview();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  setConfig(mutate) {
    const c = structuredClone(get().config!);
    mutate(c);
    set({ config: c });
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void get().refreshPreview(), 120);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), 800);
  },

  setSample(id) {
    set({ sampleId: id });
    void get().refreshPreview();
  },

  setColumns(n) {
    if (n === get().columns) return;
    localStorage.setItem("ssp.columns", String(n));
    set({ columns: n });
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void get().refreshPreview(), 80);
  },

  setColumnsMode(m) {
    localStorage.setItem("ssp.columnsMode", String(m));
    set({ columnsMode: m });
    if (typeof m === "number") get().setColumns(m);
  },

  select: (selection) => set({ selection, picker: null }),
  openPicker: (line, zone) => set({ picker: { line, zone }, selection: null }),
  closePicker: () => set({ picker: null }),

  addWidget(line, zone, widget) {
    get().setConfig((c) => {
      zoneOf(c.lines[line]!, zone).push({ widget });
    });
    const idx = zoneOf(get().config!.lines[line]!, zone).length - 1;
    set({ selection: { line, zone, index: idx }, picker: null });
  },

  removeAt(sel) {
    get().setConfig((c) => {
      zoneOf(c.lines[sel.line]!, sel.zone).splice(sel.index, 1);
    });
    set({ selection: null });
  },

  moveWidget(from, toLine, toZone, toIndex) {
    get().setConfig((c) => {
      const [item] = zoneOf(c.lines[from.line]!, from.zone).splice(from.index, 1);
      if (!item) return;
      const target = zoneOf(c.lines[toLine]!, toZone);
      target.splice(toIndex ?? target.length, 0, item);
    });
    set({ selection: null });
  },

  reorder(line, zone, from, to) {
    if (from === to) return;
    get().setConfig((c) => {
      const arr = zoneOf(c.lines[line]!, zone);
      const [item] = arr.splice(from, 1);
      if (item) arr.splice(to, 0, item);
    });
  },

  addLine() {
    get().setConfig((c) => {
      c.lines.push({ left: [], right: [] });
    });
  },

  removeLine(i) {
    get().setConfig((c) => {
      c.lines.splice(i, 1);
    });
    set({ selection: null });
  },

  moveLine(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= get().config!.lines.length) return;
    get().setConfig((c) => {
      const [l] = c.lines.splice(i, 1);
      if (l) c.lines.splice(j, 0, l);
    });
    set({ selection: null });
  },

  updateAt(sel, mutate) {
    get().setConfig((c) => {
      const w = zoneOf(c.lines[sel.line]!, sel.zone)[sel.index];
      if (w) mutate(w);
    });
  },

  applyPreset(id) {
    get().setConfig((c) => {
      c.lines = structuredClone(PRESETS[id].lines);
    });
    set({ selection: null });
  },

  async saveNow(scope = "user") {
    const c = get().config!;
    const snapshot = JSON.stringify(c);
    set({ saving: true });
    try {
      await api.saveConfig(c, scope);
      const eff = await api.config();
      // Adopt the server's normalized shape so "dirty" compares like with like — unless the user kept editing meanwhile.
      const unchanged = JSON.stringify(get().config) === snapshot;
      set({ saved: structuredClone(eff.config), layers: eff.layers, saving: false, ...(unchanged ? { config: eff.config } : {}) });
    } catch (err) {
      set({ saving: false, toast: `保存失败：${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async install() {
    try {
      await get().saveNow();
      const r = await api.install();
      set({ installed: true, toast: `已写入 ${r.settingsFile}。新开一个 Claude Code 会话即可看到。` });
    } catch (err) {
      set({ toast: `安装失败：${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async resetCounters() {
    const live = get().samples.find((x) => x.source === "live");
    try {
      const r = await api.reset(live?.id);
      set({ toast: `已重置会话 ${r.sessionId.slice(0, 8)}… 的费用 / Tokens / API 次数 / 改动行数，状态栏下次刷新起从 0 累计` });
      void get().refreshPreview();
    } catch (err) {
      set({ toast: `重置失败：${err instanceof Error ? err.message : String(err)}` });
    }
  },

  async refreshPreview() {
    const { config, sampleId, columns } = get();
    if (!config) return;
    try {
      const preview = await api.render(config, sampleId, columns);
      if (get().columns !== columns) return; // a newer request is on its way
      set({ preview, previewColumns: columns });
    } catch (err) {
      set({ toast: `预览失败：${err instanceof Error ? err.message : String(err)}` });
    }
  },

  setAdvanced(v) {
    localStorage.setItem("ssp.advanced", v ? "1" : "0");
    set({ advanced: v });
  },

  notify: (toast) => set({ toast }),
}));

export function widgetAt(state: State, sel: Selection | null): WidgetInstance | null {
  if (!sel || !state.config) return null;
  return state.config.lines[sel.line]?.[sel.zone]?.[sel.index] ?? null;
}

export function isDirty(state: State): boolean {
  return JSON.stringify(state.config) !== JSON.stringify(state.saved);
}

/** Chinese display names for the built-in widgets; falls back to the manifest name. */
export const ZH: Record<string, string> = {
  "model.badge": "模型",
  "model.effort": "思考强度",
  "model.claudeVersion": "Claude Code 版本",
  "project.path": "项目路径",
  "project.addedDirs": "附加目录",
  "project.worktree": "Worktree",
  "project.sessionName": "会话名",
  "git.branch": "Git 分支",
  "git.repo": "仓库",
  "git.pr": "Pull Request",
  "git.linesChanged": "改动行数",
  "context.bar": "上下文进度条",
  "context.value": "上下文数值",
  "context.compactions": "压缩次数",
  "context.promptCache": "Prompt 缓存",
  "usage.windows": "用量（5h / 7d）",
  "usage.single": "用量（单窗口）",
  "tokens.session": "会话 Tokens",
  "tokens.current": "当前上下文 Tokens",
  "tokens.outputSpeed": "输出速度",
  "session.duration": "会话时长",
  "session.started": "开始时间",
  "session.lastReply": "上次回复",
  "session.clock": "时钟",
  "session.apiCalls": "API 调用次数",
  "session.vimMode": "Vim 模式",
  "session.agent": "Agent 名",
  "cost.session": "费用",
  "cost.apiTime": "API 耗时",
  "activity.agents": "运行中的 Agents",
  "activity.todos": "Todo 进度",
  "activity.tools": "工具活动",
  "activity.mcp": "MCP 服务",
  "environment.counts": "配置计数",
  "environment.outputStyle": "输出风格",
  "environment.thinking": "思考开关",
  "custom.text": "固定文本",
  "custom.env": "环境变量",
  "custom.link": "链接",
};

export const ZH_CATEGORY: Record<string, string> = {
  model: "模型",
  project: "项目",
  git: "Git",
  context: "上下文",
  usage: "用量",
  cost: "费用",
  session: "会话",
  activity: "活动",
  environment: "环境",
  misc: "其他",
};

export function nameOf(w: WidgetManifest | undefined, id: string): string {
  return ZH[id] ?? w?.name ?? id;
}

/** Does this widget's own schema know about a label (so it has a built-in default)? */
export function ownsLabel(w: WidgetManifest | undefined): boolean {
  return Boolean(w?.schema.properties && "label" in w.schema.properties);
}

/**
 * The label the engine will actually print: the instance override wins, then the widget's default.
 * null means hidden / none. Older configs kept the override in options.label; that still counts.
 */
export function effectiveLabel(inst: WidgetInstance, w: WidgetManifest | undefined): string | null {
  const override = inst.label !== undefined ? inst.label : (inst.options?.label as string | null | undefined);
  if (override !== undefined) return override === "" ? null : override;
  if (ownsLabel(w)) {
    const d = w!.defaults.label;
    return typeof d === "string" && d !== "" ? d : null;
  }
  return null;
}

/** null = has real data; "filled" = sample text stands in; "hidden" = nothing to show at all. */
export function emptyStateAt(preview: RenderResult | null, sel: Selection): null | "filled" | "hidden" {
  const e = preview?.empty?.find((x) => x.line === sel.line && x.zone === sel.zone && x.index === sel.index);
  return e ? (e.filled ? "filled" : "hidden") : null;
}

/** Chinese one-liners for the built-in widgets (manifest descriptions are English). */
export const ZH_DESC: Record<string, string> = {
  "model.badge": "当前模型，可附带思考强度、供应商和快速模式标记。",
  "model.effort": "思考强度，用符号和/或文字表示。",
  "model.claudeVersion": "Claude Code 的版本号。",
  "project.path": "工作目录：只显示末级、末 N 级、~ 相对或完整路径。",
  "project.addedDirs": "用 /add-dir 加入的目录。",
  "project.worktree": "当前 git worktree 的名字。",
  "project.sessionName": "会话标题。Claude Code 会把最近一条提问当标题发过来，/rename 设过的优先。",
  "git.branch": "分支名，可附带改动标记、领先/落后数和文件统计。",
  "git.repo": "从 origin 解析出的 owner/name。",
  "git.pr": "当前分支对应的 PR / MR 及评审状态。",
  "git.linesChanged": "增删行数：本会话改过的（Claude Code 统计，提交后不清零）或工作区未提交的（git diff HEAD）。",
  "context.bar": "上下文占用进度条，按阈值变色。",
  "context.value": "上下文占用，只显示数字。",
  "context.compactions": "本次会话压缩过几次，压缩前不显示。",
  "context.promptCache": "Prompt 缓存是否还热、多久过期。",
  "usage.windows": "5 小时 / 7 天 / 花费上限用量（Pro / Max 账号）。",
  "usage.single": "只显示一个用量窗口，适合放窄的位置。",
  "tokens.session": "本次会话累计 tokens，可展开 in / out / cache 明细。",
  "tokens.current": "当前上下文窗口里的 tokens 数。",
  "tokens.outputSpeed": "输出速度 tok/s，流式输出时才有值。",
  "session.duration": "会话已进行的时长。",
  "session.started": "会话开始的时间。",
  "session.lastReply": "距上一次回复过了多久。",
  "session.clock": "本机当前时间。",
  "session.apiCalls": "本次会话调了多少次模型 API，一轮回复算一次，流式分片不重复计。",
  "session.vimMode": "当前 vim 模式。",
  "session.agent": "用 --agent 启动时的 agent 名。",
  "cost.session": "本次会话费用，Claude Code 自己的统计，缺失时按价目表估算。",
  "cost.apiTime": "本次会话等待 API 的总时长。",
  "activity.agents": "正在运行的子 agent。",
  "activity.todos": "Todo 完成数 / 总数和进行中的那一项。",
  "activity.tools": "最近的工具调用和状态。",
  "activity.mcp": "本次会话调用过的 MCP 服务，出错的会标出来。",
  "environment.counts": "当前目录生效的 CLAUDE.md / 规则 / MCP / hooks 数量。",
  "environment.outputStyle": "当前输出风格，默认风格时不显示。",
  "environment.thinking": "开启扩展思考时显示 💭。",
  "custom.text": "固定文本或符号，比如分隔符、你的名字。",
  "custom.env": "某个环境变量的值。",
  "custom.link": "可点击的文字链接。",
};

export function descOf(w: WidgetManifest | undefined, id: string): string {
  return ZH_DESC[id] ?? w?.description ?? "";
}
