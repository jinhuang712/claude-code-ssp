import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function Preview() {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const preview = useStore((s) => s.preview);
  const columns = useStore((s) => s.columns);
  const setColumns = useStore((s) => s.setColumns);
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
      lineHeight: 1.4,
      theme: { background: "#0b0e13", foreground: "#dfe4ec", cursor: "#0b0e13" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    term.current = t;
    const refit = () => {
      const dims = f.proposeDimensions();
      if (dims?.cols && dims.cols !== useStore.getState().columns) setColumns(dims.cols);
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

  useEffect(() => {
    const t = term.current;
    if (!t) return;
    const lines = preview?.lines ?? [];
    const rows = Math.max(1, lines.length);
    if (t.cols !== columns || t.rows !== rows) t.resize(columns, rows);
    t.reset();
    t.write(lines.join("\r\n"));
  }, [preview, columns]);

  const live = samples.filter((s) => s.source === "live");
  const fixture = samples.find((s) => s.source === "fixture");
  const shown = preview?.lines.length ?? 0;
  const hidden = lineCount - shown;

  return (
    <div className="term-frame">
      <div className="term-bar">
        <span className="title">预览</span>
        <span className="meta mono">
          {columns} 列{preview ? ` · ${preview.ms.toFixed(1)} ms` : ""}
        </span>
        {hidden > 0 && <span>{hidden} 行在这份数据下没有内容，不显示</span>}
        <div className="seg ml-auto">
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
      <div className="term">
        <div ref={host} className="w-full" />
      </div>
      {preview?.errors.length ? <p className="term-errors">{preview.errors.map((e) => `${e.widget}: ${e.message}`).join("　")}</p> : null}
    </div>
  );
}
