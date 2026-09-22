import { useEffect, useRef } from "react";
import { Advanced } from "./components/Advanced";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Layout } from "./components/Layout";
import { Options } from "./components/Options";
import { Picker } from "./components/Picker";
import { Preview } from "./components/Preview";
import { uiColor } from "./colors";
import { HTML_LANG, useLang, useT, type Messages } from "./i18n";
import { PRESETS, useStore, type PresetId } from "./store";
import { useTheme } from "./theme";

function Presets() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const applyPreset = useStore((s) => s.applyPreset);
  const ids = Object.keys(PRESETS) as PresetId[];
  // Compare shape only (which widgets, in which zone, in which order); ignore empty zones and per-widget tweaks.
  const sig = (lines: typeof config.lines) => lines.map((l) => (["left", "center", "right"] as const).map((z) => (l[z] ?? []).map((w) => w.widget).join(",")).join("|")).join("\n");
  const current = ids.find((id) => sig(PRESETS[id].lines) === sig(config.lines));
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">{t.presets.title}</h2>
        <span className="hint">{current ? t.presets.matches : t.presets.customised}</span>
      </div>
      <div className="choices">
        {ids.map((id) => (
          <button key={id} className="choice choice-tall" data-active={current === id} onClick={() => applyPreset(id)}>
            <span>
              {t.presets[id].name}
              <small className="ml-2">{t.presets.lines(PRESETS[id].lines.length)}</small>
            </span>
            <small>{t.presets[id].blurb}</small>
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
  const t = useT();
  const themes = useStore((s) => s.themes);
  const config = useStore((s) => s.config)!;
  const setConfig = useStore((s) => s.setConfig);
  const current = typeof config.theme === "string" ? config.theme : "custom";
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">{t.themes.title}</h2>
        <span className="hint">{t.themes.hint}</span>
      </div>
      <div className="choices">
        {themes.map((th) => (
          <button
            key={th.name}
            className="choice"
            data-active={current === th.name}
            onClick={() =>
              setConfig((c) => {
                c.theme = th.name;
              })
            }
          >
            <span className="strip" aria-hidden="true">
              {STRIP.map(([k, w]) => (
                <i key={k} style={{ width: w, background: uiColor(th.tokens[k]) }} />
              ))}
            </span>
            {th.name}
          </button>
        ))}
      </div>
    </section>
  );
}

/* Bar glyph pairs; each one is shown exactly as the statusline will draw it. Names live in `bars.names`. */
const BAR_SETS: Array<{ id: keyof Messages["bars"]["names"]; filled: string; empty: string }> = [
  { id: "theme", filled: "", empty: "" },
  { id: "block", filled: "█", empty: "░" },
  { id: "rect", filled: "▮", empty: "▯" },
  { id: "low", filled: "▆", empty: "▁" },
  { id: "half", filled: "▄", empty: "▁" },
  { id: "slant", filled: "▰", empty: "▱" },
  { id: "square", filled: "■", empty: "□" },
  { id: "line", filled: "━", empty: "╌" },
  { id: "dot", filled: "●", empty: "○" },
];

function BarGlyphs() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const themes = useStore((s) => s.themes);
  const setConfig = useStore((s) => s.setConfig);
  const themeBar = (typeof config.theme === "string" ? themes.find((th) => th.name === config.theme)?.bar : config.theme.bar) ?? { filled: "█", empty: "░" };
  const current = BAR_SETS.find((b) => b.id !== "theme" && config.bar?.filled === b.filled && config.bar?.empty === b.empty)?.id ?? (config.bar ? "custom" : "theme");
  const draw = (f: string, e: string) => f.repeat(4) + e.repeat(6);
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="h2">{t.bars.title}</h2>
        <span className="hint">{t.bars.hint}</span>
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
            <small>{t.bars.names[b.id]}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/*
  The panel borrows its accent from the statusline theme being edited. It is written as the *raw*
  terminal colour; index.css derives --accent from it (darkened in light mode for contrast).
*/
function useThemeAccent() {
  const themes = useStore((s) => s.themes);
  const theme = useStore((s) => s.config?.theme);
  useEffect(() => {
    const tokens = typeof theme === "string" ? themes.find((th) => th.name === theme)?.tokens : theme?.tokens;
    const accent = uiColor(tokens?.accent, "#4cc9e0");
    document.documentElement.style.setProperty("--accent-raw", accent);
  }, [themes, theme]);
}

/* Mirror the resolved panel scheme to <html data-theme>; index.html sets the first value pre-paint. */
function useSchemeAttr() {
  const scheme = useTheme((s) => s.scheme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", scheme);
  }, [scheme]);
}

/* Keep <html lang> in step with the UI language: screen readers and CJK font fallback both read it. */
function useHtmlLang() {
  const lang = useLang((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);
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
  const t = useT();
  const { loading, error, config, init, toast, notify } = useStore();
  const mast = useRef<HTMLDivElement>(null);
  useThemeAccent();
  useSchemeAttr();
  useHtmlLang();
  useMastheadHeight(mast);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(null), 5000);
    return () => clearTimeout(timer);
  }, [toast, notify]);

  // Global undo: Ctrl/⌘+Z restores the last pre-edit snapshot. Skipped while typing
  // (inputs own their native undo) or while IME composition is in progress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
        if (e.isComposing) return;
        e.preventDefault();
        useStore.getState().undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <div className="p-10 text-sm opacity-60">{t.app.loading}</div>;
  if (error || !config) {
    const [a, b, c] = t.app.unreachableHint;
    return (
      <div className="mx-auto max-w-xl p-10 text-sm">
        <p style={{ color: "var(--danger)" }}>{t.app.unreachable(error ?? "")}</p>
        <p className="mt-2 opacity-70">
          {a}
          <code className="mono">/ssp:config</code>
          {b}
          <code className="mono">bun run serve</code>
          {c}
        </p>
      </div>
    );
  }

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
      <Footer />
      <Picker />
      <Options />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
