import { useEffect, useState } from "react";
import { api, type DoctorReport } from "../api";
import { useStore } from "../store";

function Doctor() {
  const [r, setR] = useState<DoctorReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.doctor().then(setR).catch((e) => setErr(String(e)));
  useEffect(() => {
    void load();
  }, []);
  if (err) return <p className="hint">诊断加载失败：{err}</p>;
  if (!r) return <p className="hint">诊断加载中…</p>;
  const zh = { defaults: "内置默认", user: "用户配置", project: "项目配置" } as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="row">
        <span>诊断</span>
        <button className="btn" onClick={() => void load()}>
          刷新
        </button>
      </div>
      <div>
        <div className="hint mb-1">配置来源（后者覆盖前者）</div>
        {r.layers.map((l) => (
          <div key={l.name} className="mono text-xs flex gap-2">
            <span style={{ color: l.exists ? "var(--fg)" : "var(--muted)" }}>{l.exists ? "✓" : "–"}</span>
            <span className="w-20 shrink-0">{zh[l.name as keyof typeof zh] ?? l.name}</span>
            <span className="hint truncate">{l.path ?? "（内置）"}</span>
            {l.error && <span style={{ color: "var(--danger)" }}>{l.error}</span>}
          </div>
        ))}
      </div>
      <div>
        <div className="hint mb-1">自定义 widget 目录</div>
        {r.plugins.dirs.map((d) => (
          <div key={d} className="mono text-xs hint truncate">
            {d}
          </div>
        ))}
        {r.plugins.loaded.map((p) => (
          <div key={p.file} className="mono text-xs">
            ✓ {p.file} → {p.ids.join(", ")}
          </div>
        ))}
        {r.plugins.errors.map((e) => (
          <div key={e.file} className="mono text-xs" style={{ color: "var(--danger)" }}>
            ✗ {e.file}: {e.message}
          </div>
        ))}
        {!r.plugins.loaded.length && !r.plugins.errors.length && <div className="hint text-xs">没有加载任何自定义 widget</div>}
      </div>
      <details className="text-xs">
        <summary className="hint cursor-pointer">settings.json 里的 statusLine（{r.settings.path}）</summary>
        <pre className="mono mt-1 max-h-40 overflow-auto p-2 text-[11px]" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
          {r.settings.error ?? JSON.stringify(r.settings.statusLine, null, 2)}
        </pre>
      </details>
      <details className="text-xs">
        <summary className="hint cursor-pointer">
          Claude Code 最近一次发来的 stdin{r.lastPayload?.capturedAt ? `（${new Date(r.lastPayload.capturedAt).toLocaleTimeString()}）` : ""}
        </summary>
        <pre className="mono mt-1 max-h-72 overflow-auto p-2 text-[11px]" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
          {r.lastPayload ? JSON.stringify(r.lastPayload.payload, null, 2) : "还没有捕获到（需要开启下面的「把真实 stdin 快照存下来」）"}
        </pre>
      </details>
    </div>
  );
}

export function Advanced() {
  const s = useStore();
  const c = s.config!;
  const project = s.layers.find((l) => l.name === "project");
  return (
    <section className="section">
      <button className="disclosure" aria-expanded={s.advanced} onClick={() => s.setAdvanced(!s.advanced)}>
        <i>▸</i>
        高级设置
        <span className="hint">分隔符、颜色模式、居中区、项目级配置</span>
      </button>
      {s.advanced && (
        <div className="panel">
          <label className="row">
            <span>项目之间的分隔符</span>
            <input
              className="field mono !w-24"
              value={c.separator}
              onChange={(e) =>
                s.setConfig((x) => {
                  x.separator = e.target.value;
                })
              }
            />
          </label>
          <label className="row">
            <span>
              右边留白（列）<span className="hint ml-2">Claude Code 自身边距，右侧贴边有换行时调大</span>
            </span>
            <input
              className="field !w-20"
              type="number"
              min={0}
              max={20}
              value={c.columnsOffset}
              onChange={(e) =>
                s.setConfig((x) => {
                  x.columnsOffset = Number(e.target.value);
                })
              }
            />
          </label>
          <label className="row">
            <span>颜色模式</span>
            <select
              className="field !w-auto"
              value={c.colorLevel}
              onChange={(e) =>
                s.setConfig((x) => {
                  x.colorLevel = e.target.value as typeof x.colorLevel;
                })
              }
            >
              <option value="auto">自动</option>
              <option value="truecolor">真彩</option>
              <option value="256">256 色</option>
              <option value="16">16 色</option>
              <option value="none">无颜色</option>
            </select>
          </label>
          <label className="row">
            <span>
              把真实 stdin 快照存下来供预览<span className="hint ml-2">存在本机 ~/.claude/plugins/claude-code-ssp/samples</span>
            </span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={c.captureSamples}
              onChange={(e) =>
                s.setConfig((x) => {
                  x.captureSamples = e.target.checked;
                })
              }
            />
          </label>
          <div className="row">
            <span>
              保存到当前项目<span className="hint ml-2">{project?.path}</span>
            </span>
            <button className="btn" onClick={() => void s.saveNow("project")}>
              {project?.exists ? "覆盖项目配置" : "另存为项目配置"}
            </button>
          </div>
          <Doctor />
          <details className="text-xs">
            <summary className="hint cursor-pointer">配置 JSON</summary>
            <pre className="mono mt-1 max-h-64 overflow-auto p-2 text-[11px]" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>{JSON.stringify(c, null, 2)}</pre>
          </details>
          <p className="hint">
            自定义 widget：把一个 .ts / .js 文件放进 <code className="mono">~/.config/claude-code-ssp/widgets/</code>，重启服务后会出现在"＋"列表里。示例见仓库 examples/widgets/hello.ts。
          </p>
        </div>
      )}
    </section>
  );
}
