import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n";
import { useStore } from "../store";
import { parseAnsi } from "./Ansi";
import { Icon } from "./Icon";
import { Popover } from "./Popover";
import { SampleSelect } from "./SampleSelect";
import { TERM_THEMES, termScheme, useTheme, type TermBg } from "../theme";

/**
 * How the terminal is drawn: preview width and ground (viewer preferences, per browser) and the
 * render settings that match the statusline to a real terminal (right margin, colour depth, saved
 * snapshots — written to the config). All set once per terminal, so they share one popover.
 */
function PreviewSettings() {
  const t = useT();
  const columns = useStore((s) => s.columns);
  const columnsMode = useStore((s) => s.columnsMode);
  const setColumnsMode = useStore((s) => s.setColumnsMode);
  const ms = useStore((s) => s.preview?.ms);
  const c = useStore((s) => s.config!);
  const setConfig = useStore((s) => s.setConfig);
  const samplesDir = useStore((s) => s.paths?.samples);
  const termBg = useTheme((s) => s.termBg);
  const setTermBg = useTheme((s) => s.setTermBg);
  const widthId = useId();
  const termId = useId();
  const marginId = useId();
  const colorId = useId();
  const captureId = useId();
  return (
    <div className="settings">
      <div className="settings-row">
        <label htmlFor={widthId}>{t.preview.widthLabel}</label>
        <span className="settings-ctl">
          <select id={widthId} className="field field-sm !w-auto" value={columnsMode === "auto" ? "auto" : "fixed"} onChange={(e) => setColumnsMode(e.target.value === "auto" ? "auto" : columns)}>
            <option value="auto">{t.preview.fitWindow}</option>
            <option value="fixed">{t.preview.fixedColumns}</option>
          </select>
          {columnsMode !== "auto" && (
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
      </div>
      <div className="settings-row">
        <label htmlFor={termId}>
          {t.preview.terminalLabel}
          <span className="hint block">{t.preview.terminalHint}</span>
        </label>
        <select id={termId} className="field field-sm !w-auto" value={termBg} onChange={(e) => setTermBg(e.target.value as TermBg)}>
          <option value="auto">{t.preview.termAuto}</option>
          <option value="dark">{t.preview.termDark}</option>
          <option value="light">{t.preview.termLight}</option>
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor={marginId}>
          {t.preview.rightMargin}
          <span className="hint block">{t.preview.rightMarginHint}</span>
        </label>
        <input
          id={marginId}
          className="field field-sm mono !w-16"
          type="number"
          min={0}
          max={20}
          value={c.columnsOffset}
          onChange={(e) =>
            setConfig((x) => {
              x.columnsOffset = Number(e.target.value);
            })
          }
        />
      </div>
      <div className="settings-row">
        <label htmlFor={colorId}>{t.preview.colorMode}</label>
        <select
          id={colorId}
          className="field field-sm !w-auto"
          value={c.colorLevel}
          onChange={(e) =>
            setConfig((x) => {
              x.colorLevel = e.target.value as typeof x.colorLevel;
            })
          }
        >
          {(["auto", "truecolor", "256", "16", "none"] as const).map((lv) => (
            <option key={lv} value={lv}>
              {t.preview.colorLevels[lv]}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor={captureId}>
          {t.preview.capture}
          <span className="hint block">{t.preview.captureHint(samplesDir ?? "~/.claude/plugins/claude-code-ssp/samples")}</span>
        </label>
        <input
          id={captureId}
          type="checkbox"
          checked={c.captureSamples}
          onChange={(e) =>
            setConfig((x) => {
              x.captureSamples = e.target.checked;
            })
          }
        />
      </div>
      {/* Kept for the curious (the render budget is 40 ms), but out of the toolbar: a lone "0.1 ms" read as noise. */}
      <p className="hint settings-meta">
        {t.preview.renderTime}: <span className="mono">{ms === undefined ? "—" : `${ms.toFixed(1)} ms`}</span>
      </p>
    </div>
  );
}

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
  const lineCount = useStore((s) => s.config?.lines.length ?? 0);
  const tryOn = useStore((s) => s.tryOn);
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

  // The height held for a try-on is let go once nothing has been tried on for a moment. Keeping it
  // until the line count changed left a tall empty terminal after hovering a 4-line template. The
  // delay is what keeps the loop below away: sweeping across a row of choices never goes 500 ms
  // without a try-on, and once the pointer has left them, shrinking can't move one back under it.
  const [released, setReleased] = useState(0);
  useEffect(() => {
    if (tryOn || !hold.current) return;
    const timer = setTimeout(() => {
      hold.current = null;
      setReleased((n) => n + 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [tryOn]);

  // Redraw only from a preview rendered for the current width; a stale one would wrap.
  useEffect(() => {
    const xt = term.current;
    if (!xt || !preview || previewColumns !== columns) return;
    const lines = preview.lines;
    // Height is sticky around try-ons. Hovering a 1-line preset used to shrink the preview, which
    // moved the preset out from under the pointer (mouseleave → real config → grows back →
    // mouseenter …) and looped every ~80 ms. So a try-on may grow the preview but never shrink it;
    // the grown height is kept while the line count stays the same, until the release above.
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
  }, [preview, previewColumns, columns, tryOn, lineCount, released]);

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
          {/* The width the lines are laid out for, always visible: it explains why a line wraps. */}
          <span className="mono meta">{t.preview.columns(columns)}</span>
          {/* Set once per terminal and rarely touched again, so they sit behind one button. */}
          <Popover label={t.preview.settings} buttonClassName="btn btn-ghost btn-icon" buttonContent={<Icon name="sliders" />} align="end">
            {() => <PreviewSettings />}
          </Popover>
        </div>
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
