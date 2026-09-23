import { create } from "zustand";
import { tr, widgetName } from "./i18n";
import { applyEdits } from "./layers";
import {
  api,
  NeedsConfirm,
  type ConfigLayer,
  type EffectiveConfig,
  type FooterConfig,
  type InstallPlan,
  type LineConfig,
  type RenderResult,
  type SampleMeta,
  type ThemeDef,
  type WidgetInstance,
  type WidgetManifest,
  type Zone,
} from "./api";

export interface Selection {
  line: number;
  zone: Zone;
  index: number;
}

export type PresetId = "minimal" | "standard" | "full";
/** Which config file edits are written to. */
export type Scope = "user" | "project";

/** Preset layouts. Names and blurbs are UI copy and live in the locale files (`presets.<id>`). */
export const PRESETS: Record<PresetId, { lines: LineConfig[] }> = {
  minimal: {
    lines: [{ left: [{ widget: "project.path" }, { widget: "git.branch" }], right: [{ widget: "model.badge" }, { widget: "context.value" }] }],
  },
  standard: {
    lines: [
      { left: [{ widget: "project.path" }, { widget: "git.branch" }], right: [{ widget: "model.badge" }, { widget: "cost.session" }] },
      { left: [{ widget: "usage.windows" }], right: [{ widget: "context.bar" }] },
    ],
  },
  full: {
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
  /** The effective config being edited (defaults ← user ← project). */
  config: FooterConfig | null;
  /** The effective config as of the last load/save; edits are the diff from here (see layers.ts). */
  saved: FooterConfig | null;
  layers: ConfigLayer[];
  paths: EffectiveConfig["paths"] | null;
  /** Where edits are saved. Defaults to the project file when the previewed project has one. */
  scope: Scope;
  /**
   * The project the panel is looking at: the previewed live session's directory, or null for the
   * directory the server was started in. Drives the project layer and project-scope saves.
   */
  projectCwd: string | null;
  sandbox: boolean;
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
  /** Last save failure, shown in the header until a save succeeds (a toast alone is too easy to miss). */
  saveError: string | null;
  installed: boolean | null;
  /** What settings.json holds now and what install would write; refreshed after every install/uninstall. */
  installPlan: InstallPlan | null;
  /**
   * Set when applying would replace another tool's statusLine (claude-hud, a custom script…). The
   * header asks before anything is overwritten; "Not now" stops asking for this page view.
   */
  consent: { current: unknown } | null;
  consentDismissed: boolean;
  /** Undo stack of pre-edit snapshots (cap 30); typing bursts coalesce into one step. */
  past: FooterConfig[];
  /** Where keyboard focus should land after a keyboard move; the chip rendered there claims it. */
  focusPos: Selection | null;
  /** Latest screen-reader announcement (rendered into an aria-live region). */
  live: string;
  /**
   * A look being tried on (hover/focus on a preset, theme or bar style): merged over the config for
   * the preview only — never saved. `label` names it in the preview toolbar.
   */
  tryOn: { patch: Partial<FooterConfig>; label: string } | null;

  init(): Promise<void>;
  setConfig(mutate: (c: FooterConfig) => void): void;
  undo(): void;
  setSample(id: string | null): Promise<void>;
  setScope(scope: Scope): void;
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
  /** Save pending edits to the current scope. `autoApply: false` skips the first-save install step. */
  saveNow(opts?: { autoApply?: boolean }): Promise<void>;
  /** Snapshot the current look into the previewed project's own config file and edit that from now on. */
  saveAsProject(): Promise<void>;
  /** Let a project's own widgets load (written to the *user* file; a project can't trust itself). */
  trustProject(root: string): Promise<void>;
  /** Apply to Claude Code; `confirmReplace` is the user's explicit yes to replacing another statusLine. */
  install(confirmReplace?: boolean): Promise<void>;
  /** Stop using this statusline: restores the one it replaced, or removes ours. */
  uninstall(): Promise<void>;
  dismissConsent(): void;
  resetCounters(): Promise<void>;
  refreshPreview(): Promise<void>;
  /** Keyboard move: one step within the zone, across to the neighbouring zone at an edge, or to the line above/below. */
  nudge(sel: Selection, dir: "left" | "right" | "up" | "down"): void;
  claimFocus(): void;
  /** Preview a patch without applying it; null goes back to the real config. */
  setTryOn(t: { patch: Partial<FooterConfig>; label: string } | null): void;
  notify(msg: string | null): void;
}

let previewTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** When the last undo step was pushed; typing bursts within 1.5 s share one step. */
let lastUndoPushAt = 0;

/** localStorage can throw (blocked storage, private mode); per-viewer prefs just fall back. */
function pref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setPref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered; still applies for this page view */
  }
}

export function zoneOf(line: LineConfig, zone: Zone): WidgetInstance[] {
  if (!line[zone]) line[zone] = [];
  return line[zone]!;
}

/** The directory a sample's session ran in, when it is a live one. */
function cwdOf(samples: SampleMeta[], id: string | null): string | null {
  const s = samples.find((x) => x.id === id);
  return s?.source === "live" ? (s.cwd ?? null) : null;
}

/** Edit the project file when the project has one — its values override the user file's. */
function defaultScope(layers: ConfigLayer[]): Scope {
  return layers.some((l) => l.name === "project" && l.exists) ? "project" : "user";
}

export const useStore = create<State>((set, get) => {
  /** Adopt a freshly loaded effective config (after init, a save, or switching project). */
  const adopt = (eff: EffectiveConfig, opts: { keepEdits?: boolean; resetScope?: boolean } = {}) =>
    set({
      saved: structuredClone(eff.config),
      layers: eff.layers,
      paths: eff.paths,
      ...(opts.keepEdits ? {} : { config: eff.config }),
      ...(opts.resetScope ? { scope: defaultScope(eff.layers) } : {}),
    });

  const schedulePreview = (ms: number) => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void get().refreshPreview(), ms);
  };
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), 800);
  };

  return {
    loading: true,
    error: null,
    config: null,
    saved: null,
    layers: [],
    paths: null,
    scope: "user",
    projectCwd: null,
    sandbox: false,
    widgets: [],
    themes: [],
    samples: [],
    sampleId: null,
    columns: Number(pref("ssp.columns") ?? 120),
    columnsMode: pref("ssp.columnsMode") === null || pref("ssp.columnsMode") === "auto" ? "auto" : Number(pref("ssp.columnsMode")),
    preview: null,
    previewColumns: 0,
    selection: null,
    picker: null,
    toast: null,
    saving: false,
    saveError: null,
    installed: null,
    installPlan: null,
    consent: null,
    consentDismissed: false,
    past: [],
    focusPos: null,
    live: "",
    tryOn: null,

    async init() {
      try {
        const [widgets, themes, samples, plan, health] = await Promise.all([
          api.widgets(),
          api.themes(),
          api.samples(),
          api.installPlan().catch(() => null),
          api.health().catch(() => null),
        ]);
        const live = samples.find((s) => s.source === "live");
        const sampleId = live?.id ?? samples[0]?.id ?? null;
        const projectCwd = cwdOf(samples, sampleId);
        // The effective config depends on the project, so it loads after we know which one.
        const eff = await api.config(projectCwd).catch(() => api.config());
        set({ widgets, themes, samples, sampleId, projectCwd, sandbox: health?.sandbox === true, installed: plan ? plan.currentIsOurs : null, installPlan: plan, loading: false });
        adopt(eff, { resetScope: true });
        void get().refreshPreview();
      } catch (err) {
        set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      }
    },

    setConfig(mutate, undoable = true) {
      const before = get().config!;
      const c = structuredClone(before);
      mutate(c);
      if (JSON.stringify(c) === JSON.stringify(before)) return;
      if (undoable) {
        // Coalesce keystroke bursts: one undo step per 1.5 s of continuous editing.
        const past = get().past;
        if (Date.now() - lastUndoPushAt > 1500 || past.length === 0 || JSON.stringify(past[past.length - 1]) !== JSON.stringify(before)) {
          lastUndoPushAt = Date.now();
          set({ past: [...past.slice(-29), structuredClone(before)] });
        }
      }
      set({ config: c });
      schedulePreview(120);
      scheduleSave();
    },

    async setSample(id) {
      const { samples, projectCwd } = get();
      set({ sampleId: id });
      const cwd = cwdOf(samples, id);
      if (cwd !== projectCwd) {
        // A different project means a different project layer. Flush pending edits to where they
        // were meant to go first, then load the new project's view; undo can't cross projects.
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
          await get().saveNow();
        }
        try {
          const eff = await api.config(cwd);
          set({ projectCwd: cwd, past: [], selection: null });
          adopt(eff, { resetScope: true });
        } catch {
          /* unknown to the server (e.g. an old sample): keep the current project */
        }
      }
      void get().refreshPreview();
    },

    setScope(scope) {
      set({ scope });
    },

    setColumns(n) {
      if (n === get().columns) return;
      setPref("ssp.columns", String(n));
      set({ columns: n });
      schedulePreview(80);
    },

    setColumnsMode(m) {
      setPref("ssp.columnsMode", String(m));
      set({ columnsMode: m });
      if (typeof m === "number") get().setColumns(m);
    },

    undo() {
      const past = get().past;
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ past: past.slice(0, -1), config: structuredClone(prev), selection: null });
      schedulePreview(120);
      scheduleSave();
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
      set({ selection: null, toast: tr().toast.removed });
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
      set({ selection: null, toast: tr().toast.lineRemoved });
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
      set({ selection: null, toast: tr().toast.presetApplied });
    },

    async saveNow(opts = {}) {
      const { config: c, saved, scope, layers, projectCwd } = get();
      if (!c) return;
      const snapshot = JSON.stringify(c);
      const layer = layers.find((l) => l.name === scope)?.value ?? {};
      set({ saving: true });
      try {
        await api.saveConfig(applyEdits(layer, saved, c) as Partial<FooterConfig>, scope, projectCwd);
        const eff = await api.config(projectCwd);
        // Adopt the server's normalized shape so "dirty" compares like with like — unless the user kept editing meanwhile.
        adopt(eff, { keepEdits: JSON.stringify(get().config) !== snapshot });
        set({ saving: false, saveError: null });
        // `render` re-reads the config file on every tick, but Claude Code only runs it when
        // settings.json points at us — so the first successful save auto-applies, *unless* that
        // would replace someone else's statusLine: then the header asks first (see `consent`).
        if (opts.autoApply !== false && get().installed !== true) {
          const plan = get().installPlan;
          const foreign = plan !== null && plan.current !== null && plan.current !== undefined && !plan.currentIsOurs;
          if (foreign) {
            if (!get().consentDismissed) set({ consent: { current: plan.current } });
          } else {
            try {
              await api.install(false);
              set({ installed: true, installPlan: await api.installPlan().catch(() => plan) });
            } catch (err) {
              // The server is the final judge: it may see a foreign statusLine the stale plan missed.
              if (err instanceof NeedsConfirm && !get().consentDismissed) set({ consent: { current: err.current } });
              /* other failures: the manual button stays as a fallback and the next save retries */
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        set({ saving: false, saveError: msg, toast: tr().toast.saveFailed(msg) });
      }
    },

    async saveAsProject() {
      const { config: c, layers, projectCwd } = get();
      if (!c) return;
      // The visual choices, merged over whatever the project file already had.
      const project = layers.find((l) => l.name === "project")?.value ?? {};
      const next = { ...project, lines: c.lines, theme: c.theme, separator: c.separator, colorLevel: c.colorLevel, ...(c.bar ? { bar: c.bar } : {}) };
      try {
        await api.saveConfig(next as Partial<FooterConfig>, "project", projectCwd);
        adopt(await api.config(projectCwd));
        set({ scope: "project", saveError: null, toast: tr().toast.savedProject });
      } catch (err) {
        set({ toast: tr().toast.saveFailed(err instanceof Error ? err.message : String(err)) });
      }
    },

    async trustProject(root) {
      const { layers, projectCwd } = get();
      const user = (layers.find((l) => l.name === "user")?.value ?? {}) as Partial<FooterConfig>;
      const trusted = [...new Set([...(user.plugins?.trustedProjects ?? []), root])];
      const next = { ...user, plugins: { dirs: user.plugins?.dirs ?? [], ...user.plugins, trustedProjects: trusted } };
      try {
        await api.saveConfig(next, "user", projectCwd);
        adopt(await api.config(projectCwd), { keepEdits: true });
        set({ toast: tr().toast.trusted(root) });
      } catch (err) {
        set({ toast: tr().toast.saveFailed(err instanceof Error ? err.message : String(err)) });
      }
    },

    async install(confirmReplace = false) {
      try {
        await get().saveNow({ autoApply: false });
        const r = await api.install(confirmReplace);
        set({ installed: true, consent: null, installPlan: await api.installPlan().catch(() => get().installPlan), toast: tr().toast.installed(r.settingsFile) });
      } catch (err) {
        if (err instanceof NeedsConfirm) set({ consent: { current: err.current }, consentDismissed: false });
        else set({ toast: tr().toast.installFailed(err instanceof Error ? err.message : String(err)) });
      }
    },

    async uninstall() {
      try {
        const r = await api.uninstall();
        set({ installed: false, installPlan: await api.installPlan().catch(() => null), toast: r.restored ? tr().toast.restored : tr().toast.uninstalled });
      } catch (err) {
        set({ toast: tr().toast.uninstallFailed(err instanceof Error ? err.message : String(err)) });
      }
    },

    dismissConsent: () => set({ consent: null, consentDismissed: true }),

    async resetCounters() {
      // Reset the session being previewed when it is a live one; otherwise the most recent live one.
      const { samples, sampleId } = get();
      const live = samples.find((x) => x.id === sampleId && x.source === "live") ?? samples.find((x) => x.source === "live");
      try {
        const r = await api.reset(live?.id);
        set({ toast: tr().toast.reset(r.sessionId.slice(0, 8)) });
        void get().refreshPreview();
      } catch (err) {
        set({ toast: tr().toast.resetFailed(err instanceof Error ? err.message : String(err)) });
      }
    },

    async refreshPreview() {
      const { config, sampleId, columns, tryOn } = get();
      if (!config) return;
      try {
        const preview = await api.render(tryOn ? { ...config, ...tryOn.patch } : config, sampleId, columns);
        // A newer request is on its way (width changed, or the try-on started/ended meanwhile).
        if (get().columns !== columns || get().tryOn !== tryOn) return;
        set({ preview, previewColumns: columns });
      } catch (err) {
        set({ toast: tr().toast.previewFailed(err instanceof Error ? err.message : String(err)) });
      }
    },

    nudge(sel, dir) {
      const c = get().config!;
      const line = c.lines[sel.line];
      if (!line) return;
      const zones: Zone[] = hasCenter(get()) ? ["left", "center", "right"] : ["left", "right"];
      const len = (l: LineConfig | undefined, z: Zone) => l?.[z]?.length ?? 0;
      let to: Selection | null = null;
      if (dir === "left" || dir === "right") {
        const d = dir === "left" ? -1 : 1;
        const i = sel.index + d;
        if (i >= 0 && i < len(line, sel.zone)) to = { ...sel, index: i };
        else {
          // At the edge of a zone: hop into the neighbouring zone, entering from the near side.
          const z = zones[zones.indexOf(sel.zone) + d];
          if (z) to = { line: sel.line, zone: z, index: d < 0 ? len(line, z) : 0 };
        }
      } else {
        const l = sel.line + (dir === "up" ? -1 : 1);
        if (l >= 0 && l < c.lines.length) to = { line: l, zone: sel.zone, index: Math.min(sel.index, len(c.lines[l], sel.zone)) };
      }
      if (!to) return;
      const target = to;
      const id = line[sel.zone]?.[sel.index]?.widget ?? "";
      get().setConfig((cc) => {
        const [item] = zoneOf(cc.lines[sel.line]!, sel.zone).splice(sel.index, 1);
        if (item) zoneOf(cc.lines[target.line]!, target.zone).splice(target.index, 0, item);
      });
      const t = tr();
      const name = widgetName(t, get().widgets.find((w) => w.id === id), id);
      set({ selection: null, focusPos: target, live: t.layout.moved(name, target.line + 1, t.layout.zones[target.zone], target.index + 1) });
    },

    claimFocus: () => set({ focusPos: null }),

    setTryOn(t) {
      if (t === null && get().tryOn === null) return;
      set({ tryOn: t });
      // Short debounce: sweeping the pointer across a row of choices shouldn't fire a render per chip.
      schedulePreview(t ? 60 : 0);
    },

    notify: (toast) => set({ toast }),
  };
});

/**
 * The center zone is only shown while some line uses it. The engine still renders `center`, but
 * the editor no longer offers it for new widgets: a centred statusline segment is rare, and the
 * opt-in toggle cost every visitor a control. Configs that already use it stay fully editable.
 */
export function hasCenter(state: Pick<State, "config">): boolean {
  return state.config?.lines.some((l) => (l.center?.length ?? 0) > 0) ?? false;
}

export function widgetAt(state: State, sel: Selection | null): WidgetInstance | null {
  if (!sel || !state.config) return null;
  return state.config.lines[sel.line]?.[sel.zone]?.[sel.index] ?? null;
}

export function isDirty(state: State): boolean {
  return JSON.stringify(state.config) !== JSON.stringify(state.saved);
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
