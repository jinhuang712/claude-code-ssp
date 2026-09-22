import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useId, useRef } from "react";
import { useT } from "../i18n";
import { useStore } from "../store";
import { parseAnsi } from "./Ansi";
import { SampleSelect } from "./SampleSelect";
import { TERM_THEMES, termScheme, useTheme, type TermBg } from "../theme";

export function Preview() {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  /** Rows reserved by the last try-on, kept while the real config still has `forLines` lines. */
  const hold = useRef<{ rows: number; forLines: number } | null>(null);
  const preview = useStore((s) => s.preview);
  const previewColumns = useStore((s) => s.previewColumns);
  const columns = useStore((s) => s.columns);
  const setColumns = useStore((s) => s.setColumns);
  const columnsMode = useStore((s) => s.columnsMode);
  const setColumnsMode = useStore((s) => s.setColumnsMode);
  const lineCount = useStore((s) => s.config?.lines.length ?? 0);
  const tryOn = useStore((s) => s.tryOn);
  const termBg = useTheme((s) => s.termBg);
  const setTermBg = useTheme((s) => s.setTermBg);
  const scheme = useTheme(termScheme);
  const widthId = useId();

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
    // xterm keeps a hidden <textarea> for keyboard input. With stdin disabled it is useless here,
    // but it still takes focus and swallows Tab — a keyboard trap that made everything below the
    // preview unreachable. Take it out of the tab order and the accessibility tree; screen readers
    // get the plain-text copy rendered next to the canvas instead.
    const helper = host.current.querySelector<HTMLTextAreaElement>("textarea.xterm-helper-textarea");
    if (helper) {
      helper.tabIndex = -1;
      helper.setAttribute("aria-hidden", "true");
    }
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
    // Height is sticky around try-ons. Hovering a 1-line preset used to shrink the preview, which
    // moved the preset out from under the pointer (mouseleave → real config → grows back →
    // mouseenter …) and looped every ~80 ms. So a try-on may grow the preview but never shrink it,
    // and the grown height is kept until the real config's line count changes.
    let rows = Math.max(1, lines.length);
    if (tryOn) {
      rows = Math.max(rows, xt.rows);
      hold.current = { rows, forLines: lineCount };
    } else if (hold.current?.forLines === lineCount) {
      rows = Math.max(rows, hold.current.rows);
    } else {
      hold.current = null;
    }
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
  }, [preview, previewColumns, columns, tryOn, lineCount]);

  const shown = preview?.lines.length ?? 0;
  const hidden = Math.max(0, lineCount - shown);
  const filledCount = preview?.empty?.filter((e) => e.filled).length ?? 0;
  const hiddenCount = (preview?.empty?.length ?? 0) - filledCount;
  const liveNote = [filledCount ? t.preview.filled(filledCount) : "", hiddenCount ? t.preview.hidden(hiddenCount) : "", hidden ? t.preview.emptyLines(hidden) : ""].filter(Boolean).join(t.preview.noteJoin);
  // During a try-on the note describes the real config, not the one being hovered: its numbers would
  // be wrong, and the row appearing/disappearing would change the height (see the hover loop above).
  const realNote = useRef("");
  if (!tryOn) realNote.current = liveNote;
  const note = tryOn ? realNote.current : liveNote;

  return (
    <div className="term-frame">
      {/*
        Each control has a short visible label; its aria-label (longer, explanatory) contains that
        word, so voice-control users can say what they see (WCAG 2.5.3 Label in Name).
      */}
      <div className="term-bar">
        <span className="term-title">{t.preview.title}</span>
        <div className="term-controls">
          <label className="tb tb-grow">
            <span className="tb-label">{t.preview.dataLabel}</span>
            <SampleSelect />
          </label>
          <span className="tb">
            <label className="tb-label" htmlFor={widthId}>
              {t.preview.widthLabel}
            </label>
            <select
              id={widthId}
              className="field field-sm !w-auto"
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
                className="field field-sm mono !w-16"
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
          </span>
          <label className="tb">
            <span className="tb-label">{t.preview.terminalLabel}</span>
            <select className="field field-sm !w-auto" value={termBg} onChange={(e) => setTermBg(e.target.value as TermBg)} title={t.preview.terminal} aria-label={t.preview.terminal}>
              <option value="auto">{t.preview.termAuto}</option>
              <option value="dark">{t.preview.termDark}</option>
              <option value="light">{t.preview.termLight}</option>
            </select>
          </label>
        </div>
        <span className="meta mono" title={t.preview.renderTime}>
          {preview ? `${preview.ms.toFixed(1)} ms` : ""}
        </span>
      </div>
      <div className="term" data-fixed={columnsMode !== "auto"} data-scheme={scheme}>
        {/*
          Context, not content: in Claude Code the statusline sits under the prompt, so the preview
          draws a quiet prompt line above it. While a choice is hovered, the right end of that line
          says what is being previewed — inside the same one-line row, so the preview's height never
          changes (a height change is what made hover previews loop; see above).
        */}
        <div className="term-prompt mono" aria-hidden="true">
          <span className="term-caret">&gt;</span>
          <span className="term-ph">{t.preview.promptHint}</span>
          {tryOn && <span className="term-tryon">{t.preview.tryingOn(tryOn.label)}</span>}
        </div>
        <div ref={host} className="w-full" aria-hidden="true" />
        {/* What a screen reader announces instead of the canvas: the same lines as plain text. */}
        <pre className="sr-only" aria-label={t.preview.title}>
          {(preview?.lines ?? []).map((l) => parseAnsi(l).map((r) => r.text).join("")).join("\n")}
        </pre>
      </div>
      {/* Below the terminal, so the toolbar and the lines it controls stay adjacent. */}
      {note && <p className="term-note">{note}</p>}
      {preview?.errors.length ? <p className="term-errors">{preview.errors.map((e) => `${e.widget}: ${e.message}`).join("　")}</p> : null}
    </div>
  );
}
