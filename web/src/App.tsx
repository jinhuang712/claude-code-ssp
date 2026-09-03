import { useEffect, useRef } from "react";
import { Advanced } from "./components/Advanced";
import { Header } from "./components/Header";
import { Layout } from "./components/Layout";
import { Options } from "./components/Options";
import { Picker } from "./components/Picker";
import { Preview } from "./components/Preview";
import { uiColor } from "./colors";
import { PRESETS, useStore, type PresetId } from "./store";

function Presets() {
  const config = useStore((s) => s.config)!;
  const applyPreset = useStore((s) => s.applyPreset);
  const ids = Object.keys(PRESETS) as PresetId[];
  // Compare shape only (which widgets, in which zone, in which order); ignore empty zones and per-widget tweaks.
  const sig = (lines: typeof config.lines) => lines.map((l) => (["left", "center", "right"] as const).map((z) => (l[z] ?? []).map((w) => w.widget).join(",")).join("|")).join("\n");
  const current = ids.find((id) => sig(PRESETS[id].lines) === sig(config.lines));
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">预设</h2>
        <span className="hint">{current ? "当前布局就是这个预设" : "当前布局已在预设基础上改动，点一个预设会整体替换"}</span>
      </div>
      <div className="choices">
        {ids.map((id) => (
          <button key={id} className="choice choice-tall" data-active={current === id} onClick={() => applyPreset(id)}>
            <span>
              {PRESETS[id].name}
              <small className="ml-2">{PRESETS[id].lines.length} 行</small>
            </span>
            <small>{PRESETS[id].blurb}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/* Six theme tokens laid out in the proportions they occupy on a real line. */
const STRIP: Array<[string, number]> = [
  ["project", 22],
  ["git", 14],
  ["accent", 14],
  ["ok", 10],
  ["warn", 10],
  ["crit", 10],
];

function Themes() {
  const themes = useStore((s) => s.themes);
  const config = useStore((s) => s.config)!;
  const setConfig = useStore((s) => s.setConfig);
  const current = typeof config.theme === "string" ? config.theme : "custom";
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">配色</h2>
        <span className="hint">只影响终端里的颜色，面板的强调色会跟着换</span>
      </div>
      <div className="choices">
        {themes.map((t) => (
          <button
            key={t.name}
            className="choice"
            data-active={current === t.name}
            onClick={() =>
              setConfig((c) => {
                c.theme = t.name;
              })
            }
          >
            <span className="strip" aria-hidden="true">
              {STRIP.map(([k, w]) => (
                <i key={k} style={{ width: w, background: uiColor(t.tokens[k]) }} />
              ))}
            </span>
            {t.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/* Bar glyph pairs; each one is shown exactly as the statusline will draw it. */
const BAR_SETS: Array<{ id: string; filled: string; empty: string; name: string }> = [
  { id: "theme", filled: "", empty: "", name: "跟随配色" },
  { id: "block", filled: "█", empty: "░", name: "整格" },
  { id: "rect", filled: "▮", empty: "▯", name: "矮一档" },
  { id: "low", filled: "▆", empty: "▁", name: "贴底" },
  { id: "half", filled: "▄", empty: "▁", name: "半格" },
  { id: "slant", filled: "▰", empty: "▱", name: "斜块" },
  { id: "square", filled: "■", empty: "□", name: "方块" },
  { id: "line", filled: "━", empty: "╌", name: "细线" },
  { id: "dot", filled: "●", empty: "○", name: "圆点" },
];

function BarGlyphs() {
  const config = useStore((s) => s.config)!;
  const themes = useStore((s) => s.themes);
  const setConfig = useStore((s) => s.setConfig);
  const themeBar = (typeof config.theme === "string" ? themes.find((t) => t.name === config.theme)?.bar : config.theme.bar) ?? { filled: "█", empty: "░" };
  const current = BAR_SETS.find((b) => b.id !== "theme" && config.bar?.filled === b.filled && config.bar?.empty === b.empty)?.id ?? (config.bar ? "custom" : "theme");
  const draw = (f: string, e: string) => f.repeat(4) + e.repeat(6);
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">进度条字符</h2>
        <span className="hint">上下文、用量等所有进度条共用</span>
      </div>
      <div className="choices">
        {BAR_SETS.map((b) => (
          <button
            key={b.id}
            className="choice"
            data-active={current === b.id}
            onClick={() =>
              setConfig((c) => {
                if (b.id === "theme") delete c.bar;
                else c.bar = { filled: b.filled, empty: b.empty };
              })
            }
          >
            <span className="mono">{b.id === "theme" ? draw(themeBar.filled, themeBar.empty) : draw(b.filled, b.empty)}</span>
            <small>{b.name}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/* The panel borrows its accent from the statusline theme being edited. */
function useThemeAccent() {
  const themes = useStore((s) => s.themes);
  const theme = useStore((s) => s.config?.theme);
  useEffect(() => {
    const tokens = typeof theme === "string" ? themes.find((t) => t.name === theme)?.tokens : theme?.tokens;
    const accent = uiColor(tokens?.accent, "#4cc9e0");
    document.documentElement.style.setProperty("--accent", accent);
  }, [themes, theme]);
}

function useMastheadHeight(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty("--mast-h", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  });
}

export default function App() {
  const { loading, error, config, init, toast, notify } = useStore();
  const mast = useRef<HTMLDivElement>(null);
  useThemeAccent();
  useMastheadHeight(mast);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => notify(null), 5000);
    return () => clearTimeout(t);
  }, [toast, notify]);

  if (loading) return <div className="p-10 text-sm opacity-60">加载中…</div>;
  if (error || !config)
    return (
      <div className="mx-auto max-w-xl p-10 text-sm">
        <p style={{ color: "var(--danger)" }}>连不上本地服务：{error}</p>
        <p className="mt-2 opacity-70">
          在 Claude Code 里输入 <code className="mono">/ssp:config</code>，或在终端运行 <code className="mono">bun run serve</code>。
        </p>
      </div>
    );

  return (
    <div className="page">
      <div className="masthead" ref={mast}>
        <Header />
        <Preview />
      </div>
      <Presets />
      <Layout />
      <Themes />
      <BarGlyphs />
      <Advanced />
      <Picker />
      <Options />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
