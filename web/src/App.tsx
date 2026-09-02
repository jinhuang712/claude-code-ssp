import { useEffect } from "react";
import { Advanced } from "./components/Advanced";
import { Header } from "./components/Header";
import { Layout } from "./components/Layout";
import { Options } from "./components/Options";
import { Picker } from "./components/Picker";
import { Preview } from "./components/Preview";
import { PRESETS, useStore, type PresetId } from "./store";

function Presets() {
  const config = useStore((s) => s.config)!;
  const applyPreset = useStore((s) => s.applyPreset);
  const current = (Object.keys(PRESETS) as PresetId[]).find((id) => JSON.stringify(PRESETS[id].lines) === JSON.stringify(config.lines));
  return (
    <section className="section">
      <h2 className="h2">从一个预设开始</h2>
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(PRESETS) as PresetId[]).map((id) => (
          <button key={id} className="card text-left" data-active={current === id} onClick={() => applyPreset(id)}>
            <div className="font-medium">{PRESETS[id].name}</div>
            <div className="mt-0.5 text-xs opacity-60">{PRESETS[id].blurb}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Themes() {
  const themes = useStore((s) => s.themes);
  const config = useStore((s) => s.config)!;
  const setConfig = useStore((s) => s.setConfig);
  const current = typeof config.theme === "string" ? config.theme : "custom";
  return (
    <section className="section">
      <h2 className="h2">配色</h2>
      <div className="flex flex-wrap gap-2">
        {themes.map((t) => (
          <button
            key={t.name}
            className="card flex items-center gap-2 !px-3 !py-2"
            data-active={current === t.name}
            onClick={() =>
              setConfig((c) => {
                c.theme = t.name;
              })
            }
          >
            <span className="flex gap-0.5">
              {["accent", "ok", "warn", "crit", "project"].map((k) => (
                <i key={k} className="block h-3 w-3 rounded-sm" style={{ background: cssColor(t.tokens[k] ?? "#888") }} />
              ))}
            </span>
            <span className="text-sm">{t.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const NAMED: Record<string, string> = {
  black: "#000", red: "#e5484d", green: "#46a758", yellow: "#f5d90a", blue: "#3e63dd", magenta: "#ab4aba", cyan: "#05a2c2", white: "#eee",
  gray: "#888", brightBlue: "#5b8def", brightWhite: "#fff",
};
function cssColor(v: string): string {
  if (v.startsWith("#")) return v;
  return NAMED[v] ?? "#888";
}

export default function App() {
  const { loading, error, config, init, toast, notify } = useStore();

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
        <p className="text-red-400">连不上本地服务：{error}</p>
        <p className="mt-2 opacity-70">
          在 Claude Code 里输入 <code className="mono">/ssp:config</code>，或在终端运行 <code className="mono">bun run serve</code>。
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl px-5 pb-24">
      <Header />
      <Preview />
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
