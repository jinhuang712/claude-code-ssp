import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import { useStore } from "../store";
import { TERM_THEMES, termScheme, useTheme, type TermBg } from "../theme";

export function Preview() {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const preview = useStore((s) => s.preview);
  const previewColumns = useStore((s) => s.previewColumns);
  const columns = useStore((s) => s.columns);
  const setColumns = useStore((s) => s.setColumns);
  const columnsMode = useStore((s) => s.columnsMode);
  const setColumnsMode = useStore((s) => s.setColumnsMode);
  const samples = useStore((s) => s.samples);
  const sampleId = useStore((s) => s.sampleId);
  const setSample = useStore((s) => s.setSample);
  const lineCount = useStore((s) => s.config?.lines.length ?? 0);
  const termBg = useTheme((s) => s.termBg);
  const setTermBg = useTheme((s) => s.setTermBg);
  const scheme = useTheme(termScheme);

  useEffect(() => {
    if (!host.current) return;
    const xt = new Terminal({
      rows: 3,
      disableStdin: true,
      cursorBlink: false,
      cursorInactiveStyle: "none",
      fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: TERM_THEMES[termScheme(useTheme.getState())],
    });
    const f = new FitAddon();
    xt.loadAddon(f);
    xt.open(host.current);
    term.current = xt;
    const refit = () => {
      if (useStore.getState().columnsMode !== "auto") return;
      const dims = f.proposeDimensions();
      if (dims?.cols) setColumns(dims.cols);
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      xt.dispose();
      term.current = null;
    };
  }, [setColumns]);

  // Repaint in place when the terminal background changes; xterm re-renders the buffer itself.
  useEffect(() => {
    if (term.current) term.current.options.theme = TERM_THEMES[scheme];
  }, [scheme]);

  // Switching back to "auto" re-measures immediately instead of waiting for a resize.
  useEffect(() => {
    if (columnsMode !== "auto" || !host.current) return;
    const w = host.current.clientWidth;
    const cell = host.current.querySelector<HTMLElement>(".xterm-screen")?.clientWidth;
    const cols = term.current?.cols;
    if (w && cell && cols) setColumns(Math.max(20, Math.floor((w / cell) * cols)));
  }, [columnsMode, setColumns]);

  // Redraw only from a preview rendered for the current width; a stale one would wrap.
  useEffect(() => {
    const xt = term.current;
    if (!xt || !preview || previewColumns !== columns) return;
    const lines = preview.lines;
    const rows = Math.max(1, lines.length);
    if (xt.cols !== columns || xt.rows !== rows) xt.resize(columns, rows);
    xt.reset();
    // If a line still wraps inside xterm (a glyph whose width the engine and xterm disagree on),
    // the buffer grows past `rows` and the first line scrolls out of view. Grow to fit instead,
    // so the preview never silently hides a line.
    xt.write(lines.join("\r\n"), () => {
      const used = xt.buffer.active.length;
      if (used > xt.rows) xt.resize(xt.cols, used);
      // xterm keeps the bottom anchored on resize; pin the top so line 1 is what shows first.
      xt.scrollToTop();
    });
  }, [preview, previewColumns, columns]);

  const shown = preview?.lines.length ?? 0;
  const hidden = Math.max(0, lineCount - shown);
  const filledCount = preview?.empty?.filter((e) => e.filled).length ?? 0;
  const hiddenCount = (preview?.empty?.length ?? 0) - filledCount;
  const note = [filledCount ? t.preview.filled(filledCount) : "", hiddenCount ? t.preview.hidden(hiddenCount) : "", hidden ? t.preview.emptyLines(hidden) : ""].filter(Boolean).join(t.preview.noteJoin);

  return (
    <div className="term-frame">
      <div className="term-bar">
        <span className="title">{t.preview.title}</span>
        <span className="meta mono" title={t.preview.renderTime}>
          {preview ? `${preview.ms.toFixed(1)} ms` : ""}
        </span>
        <div className="term-controls">
          <div className="cols">
          <select
            className="field !w-auto !py-0.5"
            value={columnsMode === "auto" ? "auto" : "fixed"}
            onChange={(e) => setColumnsMode(e.target.value === "auto" ? "auto" : columns)}
            title={t.preview.width}
            aria-label={t.preview.width}
          >
            <option value="auto">{t.preview.fitWindow}</option>
            <option value="fixed">{t.preview.fixedColumns}</option>
          </select>
            {columnsMode === "auto" ? (
              <span className="mono meta">{t.preview.columns(columns)}</span>
            ) : (
              <input
                className="field mono !w-16 !py-0.5"
                type="number"
                min={40}
                max={400}
                value={columns}
                aria-label={t.preview.fixedColumns}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 40) setColumnsMode(n);
                }}
              />
            )}
          </div>
          <select className="field !w-auto !py-0.5" value={termBg} onChange={(e) => setTermBg(e.target.value as TermBg)} title={t.preview.terminal} aria-label={t.preview.terminal}>
            <option value="auto">{t.preview.termAuto}</option>
            <option value="dark">{t.preview.termDark}</option>
            <option value="light">{t.preview.termLight}</option>
          </select>
          <select className="field sample-select !py-0.5" value={sampleId ?? ""} onChange={(e) => setSample(e.target.value || null)} title={t.preview.sample} aria-label={t.preview.sample}>
            {samples.length === 0 && <option value="">{t.preview.noSamples}</option>}
            {samples.map((sm) => (
              <option key={sm.id} value={sm.id}>
                {sm.source === "live" ? t.preview.liveSample(sm.label) : t.preview.fixtureSample(sm.label)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* The note gets its own row: squeezed into the toolbar it wrapped one word per line. */}
      {note && <p className="term-note">{note}</p>}
      <div className="term" data-fixed={columnsMode !== "auto"} data-scheme={scheme}>
        <div ref={host} className="w-full" />
      </div>
      {preview?.errors.length ? <p className="term-errors">{preview.errors.map((e) => `${e.widget}: ${e.message}`).join("　")}</p> : null}
    </div>
  );
}
