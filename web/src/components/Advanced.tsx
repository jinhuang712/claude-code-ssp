import { useStore } from "../store";

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
