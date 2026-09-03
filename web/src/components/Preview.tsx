import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function Preview() {
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

  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      rows: 3,
      disableStdin: true,
      cursorBlink: false,
      cursorInactiveStyle: "none",
      fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: { background: "#0b0e13", foreground: "#dfe4ec", cursor: "#0b0e13" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    term.current = t;
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
      t.dispose();
      term.current = null;
    };
  }, [setColumns]);

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
    const t = term.current;
    if (!t || !preview || previewColumns !== columns) return;
    const lines = preview.lines;
    const rows = Math.max(1, lines.length);
    if (t.cols !== columns || t.rows !== rows) t.resize(columns, rows);
    t.reset();
    t.write(lines.join("\r\n"));
  }, [preview, previewColumns, columns]);

  const live = samples.filter((s) => s.source === "live");
  const fixture = samples.find((s) => s.source === "fixture");
  const shown = preview?.lines.length ?? 0;
  const hidden = Math.max(0, lineCount - shown);
  const filledCount = preview?.empty?.filter((e) => e.filled).length ?? 0;
  const hiddenCount = (preview?.empty?.length ?? 0) - filledCount;
  const note = [filledCount ? `${filledCount} 项还没有真实数据，先用示例值占位` : "", hiddenCount ? `${hiddenCount} 项没有数据也没有示例，不显示` : "", hidden ? `${hidden} 行因此为空` : ""].filter(Boolean).join("；");

  return (
    <div className="term-frame">
      <div className="term-bar">
        <span className="title">预览</span>
        <span className="meta mono">{preview ? `${preview.ms.toFixed(1)} ms` : ""}</span>
        {note && <span>{note}</span>}
        <div className="cols ml-auto">
          <select
            className="field !w-auto !py-0.5"
            value={columnsMode === "auto" ? "auto" : "fixed"}
            onChange={(e) => setColumnsMode(e.target.value === "auto" ? "auto" : columns)}
            title="预览宽度"
          >
            <option value="auto">宽度跟随窗口</option>
            <option value="fixed">按终端列数</option>
          </select>
          {columnsMode === "auto" ? (
            <span className="mono meta">{columns} 列</span>
          ) : (
            <input
              className="field mono !w-16 !py-0.5"
              type="number"
              min={40}
              max={400}
              value={columns}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 40) setColumnsMode(n);
              }}
            />
          )}
        </div>
        <div className="seg">
          {live[0] && (
            <button data-active={sampleId === live[0].id} onClick={() => setSample(live[0]!.id)} title={live[0].label}>
              我的会话
            </button>
          )}
          {fixture && (
            <button data-active={sampleId === fixture.id} onClick={() => setSample(fixture.id)}>
              示例数据
            </button>
          )}
        </div>
      </div>
      <div className="term" data-fixed={columnsMode !== "auto"}>
        <div ref={host} className="w-full" />
      </div>
      {preview?.errors.length ? <p className="term-errors">{preview.errors.map((e) => `${e.widget}: ${e.message}`).join("　")}</p> : null}
    </div>
  );
}
