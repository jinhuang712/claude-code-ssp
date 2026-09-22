import { useEffect, useRef, useState } from "react";
import type { FooterConfig, LineConfig } from "./api";
import { Advanced, Diagnostics } from "./components/Advanced";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Layout } from "./components/Layout";
import { Options } from "./components/Options";
import { Picker } from "./components/Picker";
import { Preview } from "./components/Preview";
import { TextField } from "./components/TextField";
import { CAT_COLOR, uiColor } from "./colors";
import { HTML_LANG, useLang, useT, type Messages } from "./i18n";
import { PRESETS, useStore, type PresetId } from "./store";
import { termScheme, useTheme } from "./theme";

/**
 * Hover or focus a choice to see it in the preview before committing to it (the try-on never
 * saves; clicking applies). Spread the result onto the choice button.
 */
function useTryOn() {
  const setTryOn = useStore((s) => s.setTryOn);
  return (patch: Partial<FooterConfig>, label: string) => ({
    onMouseEnter: () => setTryOn({ patch, label }),
    onMouseLeave: () => setTryOn(null),
    onFocus: () => setTryOn({ patch, label }),
    onBlur: () => setTryOn(null),
  });
}

/** First-run guide: shown until dismissed, and only while nothing has been saved yet. */
function Welcome() {
  const t = useT();
  const firstRun = useStore((s) => !s.layers.some((l) => l.name !== "defaults" && l.exists));
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("ssp.welcomed") === "1";
    } catch {
      return false;
    }
  });
  if (!firstRun || dismissed) return null;
  return (
    <section className="section welcome" aria-labelledby="welcome-title">
      <h2 id="welcome-title" className="h2">
        <span className="brand-mark" aria-hidden="true">
          ✻
        </span>
        {t.welcome.title}
      </h2>
      <ol>
        {t.welcome.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <button
        className="btn btn-primary"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem("ssp.welcomed", "1");
          } catch {
            /* shown again next visit; harmless */
          }
        }}
      >
        {t.welcome.dismiss}
      </button>
    </section>
  );
}

/** The most lines any preset has: every sketch reserves this many rows so the cards line up. */
const SKETCH_ROWS = Math.max(...Object.values(PRESETS).map((p) => p.lines.length));

/**
 * A preset's layout drawn as a thumbnail: one row per line, one bar per widget in its category
 * colour, left and right zones pushed apart as on the real line. Bar widths follow the length of
 * each widget's sample output, so a wide widget (a context bar) reads wider than a short one.
 */
function PresetSketch({ lines }: { lines: LineConfig[] }) {
  const widgets = useStore((s) => s.widgets);
  const bar = (id: string, i: number) => {
    const m = widgets.find((w) => w.id === id);
    const cat = m?.category ?? id.split(".")[0] ?? "misc";
    // A sample's length ≈ its rendered width in columns; as a share of a ~60-column line it scales
    // with the card. Bars may shrink (flex) when a busy line would overflow, but keep their ratios.
    const share = Math.min(40, Math.max(6, ((m?.sample?.length ?? 10) / 60) * 100));
    return <i key={i} style={{ flexBasis: `${share}%`, background: CAT_COLOR[cat] ?? CAT_COLOR.misc }} />;
  };
  return (
    <span className="sketch" aria-hidden="true">
      {Array.from({ length: SKETCH_ROWS }, (_, r) => {
        const l = lines[r];
        return (
          <span key={r} className="sk-line" data-empty={!l}>
            <span className="sk-zone">{(l?.left ?? []).map((w, i) => bar(w.widget, i))}</span>
            <span className="sk-zone">{(l?.right ?? []).map((w, i) => bar(w.widget, i))}</span>
          </span>
        );
      })}
    </span>
  );
}

function Presets() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const applyPreset = useStore((s) => s.applyPreset);
  const setTryOn = useStore((s) => s.setTryOn);
  const tryOn = useTryOn();
  const ids = Object.keys(PRESETS) as PresetId[];
  // Compare shape only (which widgets, in which zone, in which order); ignore empty zones and per-widget tweaks.
  const sig = (lines: typeof config.lines) => lines.map((l) => (["left", "center", "right"] as const).map((z) => (l[z] ?? []).map((w) => w.widget).join(",")).join("|")).join("\n");
  const current = ids.find((id) => sig(PRESETS[id].lines) === sig(config.lines));
  return (
    <section className="section" aria-labelledby="presets-title">
      <div className="section-head">
        <h2 id="presets-title" className="h2">
          {t.presets.title}
        </h2>
        <p className="hint">
          {current ? t.presets.matches : t.presets.customised} · {t.presets.hoverHint}
        </p>
      </div>
      <div className="presets">
        {ids.map((id) => (
          <button
            key={id}
            className="preset"
            data-active={current === id}
            aria-pressed={current === id}
            {...tryOn({ lines: PRESETS[id].lines }, t.presets[id].name)}
            onClick={() => {
              applyPreset(id);
              setTryOn(null);
            }}
          >
            <PresetSketch lines={PRESETS[id].lines} />
            <span className="preset-text">
              <span className="preset-name">
                {t.presets[id].name}
                <small>{t.presets.lines(PRESETS[id].lines.length)}</small>
              </span>
              <span className="preset-blurb">{t.presets[id].blurb}</span>
            </span>
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

/**
 * One labelled row of the Style card: title and explanation on the left (above, on a phone), the
 * choices on the right. The row is a named group so a screen reader announces what the choices are for.
 */
function StyleRow({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="style-row" role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`}>
      <div className="style-label">
        <h3 id={`${id}-title`}>{title}</h3>
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      </div>
      <div className="choices">{children}</div>
    </div>
  );
}

function Themes() {
  const t = useT();
  const themes = useStore((s) => s.themes);
  const config = useStore((s) => s.config)!;
  const setConfig = useStore((s) => s.setConfig);
  const setTryOn = useStore((s) => s.setTryOn);
  const tryOn = useTryOn();
  // Swatches sit on the preview's terminal ground: theme colours are made for a terminal, and a
  // pale theme on the light panel (or a dark one on the dark panel) would misrepresent them.
  const ground = useTheme(termScheme);
  const current = typeof config.theme === "string" ? config.theme : "custom";
  return (
    <StyleRow id="themes" title={t.themes.title} hint={t.themes.hint}>
        {themes.map((th) => (
          <button
            key={th.name}
            className="choice"
            data-active={current === th.name}
            aria-pressed={current === th.name}
            {...tryOn({ theme: th.name }, th.name)}
            onClick={() => {
              setConfig((c) => {
                c.theme = th.name;
              });
              setTryOn(null);
            }}
          >
            <span className="strip" data-scheme={ground} aria-hidden="true">
              {STRIP.map(([k, w]) => (
                <i key={k} style={{ width: w, background: uiColor(th.tokens[k]) }} />
              ))}
            </span>
            {th.name}
          </button>
        ))}
    </StyleRow>
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
  const setTryOn = useStore((s) => s.setTryOn);
  const tryOn = useTryOn();
  const themeBar = (typeof config.theme === "string" ? themes.find((th) => th.name === config.theme)?.bar : config.theme.bar) ?? { filled: "█", empty: "░" };
  const current = BAR_SETS.find((b) => b.id !== "theme" && config.bar?.filled === b.filled && config.bar?.empty === b.empty)?.id ?? (config.bar ? "custom" : "theme");
  const draw = (f: string, e: string) => f.repeat(4) + e.repeat(6);
  return (
    <StyleRow id="bars" title={t.bars.title} hint={t.bars.hint}>
        {BAR_SETS.map((b) => (
          <button
            key={b.id}
            className="choice"
            data-active={current === b.id}
            aria-pressed={current === b.id}
            // "Theme default" previews as the theme's own glyphs: patch them in explicitly.
            {...tryOn({ bar: b.id === "theme" ? themeBar : { filled: b.filled, empty: b.empty } }, t.bars.names[b.id])}
            onClick={() => {
              setConfig((c) => {
                if (b.id === "theme") delete c.bar;
                else c.bar = { filled: b.filled, empty: b.empty };
              });
              setTryOn(null);
            }}
          >
            <span className="mono glyphs">{b.id === "theme" ? draw(themeBar.filled, themeBar.empty) : draw(b.filled, b.empty)}</span>
            <small>{t.bars.names[b.id]}</small>
          </button>
        ))}
    </StyleRow>
  );
}

/** Common separators. Each chip shows it between two words so the spacing is visible. */
const SEPARATORS = [" │ ", " · ", " • ", " / ", " | ", " ❯ ", "  "];
/** Spaces are invisible in a text field; ␣ makes a leading/trailing/double space readable. */
const showSpaces = (s: string) => s.replace(/ /g, "␣");

function Separators() {
  const t = useT();
  const sep = useStore((s) => s.config!.separator);
  const setConfig = useStore((s) => s.setConfig);
  const setTryOn = useStore((s) => s.setTryOn);
  const tryOn = useTryOn();
  const custom = !SEPARATORS.includes(sep);
  const set = (v: string) => {
    setConfig((c) => {
      c.separator = v;
    });
    setTryOn(null);
  };
  return (
    <StyleRow id="separators" title={t.separators.title} hint={t.separators.hint}>
        {SEPARATORS.map((v) => (
          <button key={v} className="choice" data-active={sep === v} aria-pressed={sep === v} {...tryOn({ separator: v }, showSpaces(v))} onClick={() => set(v)} aria-label={showSpaces(v)}>
            <span className="mono sep-sample">
              main<b>{v}</b>42%
            </span>
          </button>
        ))}
        <span className="choice choice-custom" data-active={custom}>
          {/* Empty unless the value really is custom: a preset like " │ " in a text box reads as an empty field with a caret. */}
          <TextField className="field mono !w-28" value={custom ? sep : ""} onChange={(v) => setConfig((c) => void (c.separator = v))} ariaLabel={t.separators.customLabel} placeholder={t.separators.custom} />
          {custom && (
            <span className="mono hint" title={t.separators.spacesShown}>
              {showSpaces(sep)}
            </span>
          )}
        </span>
    </StyleRow>
  );
}

/** How the statusline looks: colours, bar glyphs and the separator, as one card of labelled rows. */
function Style() {
  const t = useT();
  return (
    <section className="section" aria-labelledby="style-title">
      <div className="section-head">
        <h2 id="style-title" className="h2">
          {t.style.title}
        </h2>
        <p className="hint">{t.style.hint}</p>
      </div>
      <div className="card style-card">
        <Themes />
        <BarGlyphs />
        <Separators />
      </div>
    </section>
  );
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

  // The masthead spans the window (its bottom rule reaches both edges) while its content, the page
  // and the footer share one centred column (.wrap).
  return (
    <>
      <div className="masthead" ref={mast}>
        <div className="wrap">
          <Header />
          <Preview />
        </div>
      </div>
      <main className="wrap page">
        <Welcome />
        <Presets />
        <Layout />
        <Style />
        <Advanced />
        <Diagnostics />
      </main>
      <div className="wrap">
        <Footer />
      </div>
      <Picker />
      <Options />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
