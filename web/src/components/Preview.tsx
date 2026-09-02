import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function Preview() {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const preview = useStore((s) => s.preview);
  const columns = useStore((s) => s.columns);
  const setColumns = useStore((s) => s.setColumns);
  const samples = useStore((s) => s.samples);
  const sampleId = useStore((s) => s.sampleId);
  const setSample = useStore((s) => s.setSample);

  // Mount once; columns follow the container width so the preview is never clipped.
  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      rows: 3,
      disableStdin: true,
      cursorBlink: false,
      cursorInactiveStyle: "none",
      fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.35,
      theme: { background: "#0f1218", foreground: "#e6e8ee", cursor: "#0f1218" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    term.current = t;
    fit.current = f;
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
      fit.current = null;
    };
  }, [setColumns]);

  useEffect(() => {
    const t = term.current;
    if (!t) return;
    const rows = Math.max(2, (preview?.lines.length ?? 1) + 1);
    if (t.cols !== columns || t.rows !== rows) t.resize(columns, rows);
    t.reset();
    if (preview) t.write(preview.lines.join("\r\n"));
  }, [preview, columns]);

  const live = samples.filter((s) => s.source === "live");
  const fixture = samples.find((s) => s.source === "fixture");

  return (
    <section className="section">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="h2 !mb-0">预览</h2>
        <span className="text-xs opacity-40">{columns} 列 · 随窗口宽度变化</span>
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
      {preview?.errors.length ? <p className="mt-2 text-xs text-amber-300">{preview.errors.map((e) => `${e.widget}: ${e.message}`).join(" · ")}</p> : null}
    </section>
  );
}
