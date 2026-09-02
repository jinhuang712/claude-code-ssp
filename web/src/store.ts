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
  preview: RenderResult | null;
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
  preview: null,
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
    localStorage.setItem("ssp.columns", String(n));
    set({ columns: n });
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void get().refreshPreview(), 80);
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

  async refreshPreview() {
    const { config, sampleId, columns } = get();
    if (!config) return;
    try {
      const preview = await api.render(config, sampleId, columns);
      set({ preview });
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
