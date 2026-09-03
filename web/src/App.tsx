import { useEffect } from "react";
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
        <span className="hint">{current ? PRESETS[current].blurb : "已在预设基础上改动"}</span>
      </div>
      <div className="choices">
        {ids.map((id) => (
          <button key={id} className="choice" data-active={current === id} onClick={() => applyPreset(id)}>
            {PRESETS[id].name}
            <small>{PRESETS[id].lines.length} 行</small>
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

export default function App() {
  const { loading, error, config, init, toast, notify } = useStore();
  useThemeAccent();

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
      <div className="masthead">
        <Header />
        <Preview />
      </div>
      <Presets />
      <Layout />
      <Themes />
      <Advanced />
      <Picker />
      <Options />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
