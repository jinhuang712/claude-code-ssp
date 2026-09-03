import { useEffect } from "react";
import type { JsonSchema, Style } from "../api";
import { nameOf, useStore, widgetAt } from "../store";

const ZH_FIELD: Record<string, string> = {
  label: "标签",
  format: "格式",
  brackets: "加方括号",
  showEffort: "显示思考强度",
  showProvider: "显示供应商",
  showFastMode: "快速模式标记 ⚡",
  levels: "路径深度",
  link: "可点击链接",
  icon: "图标",
  prefix: "前缀",
  showDirty: "有改动时加 *",
  showAheadBehind: "显示 ↑N ↓N",
  showFileStats: "显示文件统计",
  width: "进度条宽度",
  value: "数值形式",
  warnAt: "黄色阈值 %",
  critAt: "红色阈值 %",
  bar: "进度条",
  barWidth: "进度条宽度",
  show5h: "显示 5 小时窗口",
  show7d: "显示 7 天窗口",
  showSpend: "显示花费上限",
  showReset: "显示重置时间",
  resetFormat: "重置时间格式",
  breakdown: "显示 in/out/cache 明细",
  style: "明细样式",
  source: "数据来源",
  max: "最多显示",
  showModel: "显示模型",
  showDescription: "显示描述",
  showCurrent: "显示进行中的项",
  runningOnly: "只显示运行中",
  hideZero: "隐藏为 0 的项",
  allowRoutedCost: "Bedrock/Vertex 也显示",
  showSource: "估算值加 ≈",
  showHitRatio: "显示命中率",
  symbolOnly: "只显示符号",
  seconds: "显示秒",
  text: "文本",
  color: "颜色",
  url: "链接地址",
  name: "名称",
  autoCompactWindow: "自动压缩窗口（tokens）",
};

const ZH_ENUM: Record<string, string> = {
  full: "完整",
  compact: "紧凑",
  short: "最短",
  tilde: "~/相对",
  percent: "百分比",
  tokens: "tokens",
  remaining: "剩余",
  both: "两者",
  words: "文字",
  arrows: "箭头",
  relative: "倒计时",
  absolute: "时刻",
  used: "已用",
  transcript: "会话记录",
  stdin: "Claude Code 上报",
  datetime: "日期+时间",
  time: "仅时间",
  "owner/name": "owner/name",
  "5h": "5 小时",
  "7d": "7 天",
};

function typeOf(schema: JsonSchema) {
  const t = Array.isArray(schema.type) ? schema.type : [schema.type ?? "string"];
  return { base: t.find((x) => x !== "null") ?? "string", nullable: t.includes("null") };
}

function Field({ name, schema, value, onChange }: { name: string; schema: JsonSchema; value: unknown; onChange: (v: unknown) => void }) {
  const { base, nullable } = typeOf(schema);
  const title = ZH_FIELD[name] ?? schema.title ?? name;
  const effective = value === undefined ? schema.default : value;

  if (schema.enum) {
    return (
      <label className="row">
        <span>{title}</span>
        <select className="field !w-auto" value={String(effective ?? "")} onChange={(e) => onChange(e.target.value)}>
          {schema.enum.map((v) => (
            <option key={String(v)} value={String(v)}>
              {ZH_ENUM[String(v)] ?? String(v)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (base === "boolean") {
    return (
      <label className="row">
        <span>{title}</span>
        <input type="checkbox" className="h-4 w-4" checked={Boolean(effective)} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }
  if (base === "integer" || base === "number") {
    return (
      <label className="row">
        <span>{title}</span>
        <input
          className="field !w-24"
          type="number"
          min={schema.minimum}
          max={schema.maximum}
          value={effective === null || effective === undefined ? "" : Number(effective)}
          onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : schema.default) : Number(e.target.value))}
        />
      </label>
    );
  }
  return (
    <label className="row">
      <span>{title}</span>
      <span className="flex items-center gap-1.5">
        <input
          className="field mono !w-40"
          disabled={effective === null}
          value={effective === null || effective === undefined ? "" : String(effective)}
          placeholder={effective === null ? "已隐藏" : ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {nullable && (
          <button className="btn" onClick={() => onChange(effective === null ? (schema.default ?? "") : null)}>
            {effective === null ? "显示" : "隐藏"}
          </button>
        )}
      </span>
    </label>
  );
}

const TOKENS: Array<[string, string]> = [
  ["", "默认"],
  ["fg", "正文"],
  ["muted", "弱化"],
  ["accent", "强调"],
  ["ok", "绿"],
  ["warn", "黄"],
  ["crit", "红"],
];

export function Options() {
  const s = useStore();
  const sel = s.selection;
  const w = widgetAt(s, sel);
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && s.select(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, s]);
  if (!sel || !w) return null;
  const manifest = s.widgets.find((m) => m.id === w.widget);
  const props = manifest?.schema.properties ?? {};
  const style: Style = w.style ?? {};
  const setStyle = (patch: Partial<Style>) =>
    s.updateAt(sel, (inst) => {
      const next: Style = { ...(inst.style ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof Style)[]) if (!next[k]) delete next[k];
      if (Object.keys(next).length) inst.style = next;
      else delete inst.style;
    });

  return (
    <div className="overlay" onClick={() => s.select(null)}>
      <div className="sheet !max-w-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="修改选项">
        <div className="sheet-head">
          <h3 className="text-base font-semibold">{nameOf(manifest, w.widget)}</h3>
          <span className="mono hint">{w.widget}</span>
          <button className="btn ml-auto" onClick={() => s.select(null)}>
            完成
          </button>
        </div>
        <div className="sheet-body">
          {manifest?.description && <p className="hint">{manifest.description}</p>}
          {Object.entries(props).map(([name, schema]) => (
            <Field
              key={name}
              name={name}
              schema={schema}
              value={w.options?.[name]}
              onChange={(v) =>
                s.updateAt(sel, (inst) => {
                  inst.options = { ...(inst.options ?? {}), [name]: v };
                  if (v === schema.default) delete inst.options[name];
                  if (Object.keys(inst.options).length === 0) delete inst.options;
                })
              }
            />
          ))}
          <label className="row">
            <span>颜色</span>
            <select className="field !w-auto" value={TOKENS.some(([k]) => k === (style.fg ?? "")) ? (style.fg ?? "") : "custom"} onChange={(e) => setStyle({ fg: e.target.value === "custom" ? "#ffffff" : e.target.value || undefined })}>
              {TOKENS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
              <option value="custom">自定义…</option>
            </select>
          </label>
          {style.fg && !TOKENS.some(([k]) => k === style.fg) && (
            <label className="row">
              <span>自定义颜色</span>
              <input className="field mono !w-32" value={style.fg} onChange={(e) => setStyle({ fg: e.target.value })} placeholder="#rrggbb" />
            </label>
          )}
          <label className="row">
            <span>加粗</span>
            <input type="checkbox" className="h-4 w-4" checked={!!style.bold} onChange={(e) => setStyle({ bold: e.target.checked })} />
          </label>
          <div className="mt-2 flex justify-between pt-3" style={{ borderTop: "1px solid var(--line)" }}>
            <button className="btn btn-danger" onClick={() => s.removeAt(sel)}>
              从状态栏移除
            </button>
            {s.advanced && (
              <details className="text-xs">
                <summary className="hint cursor-pointer">JSON</summary>
                <pre className="mono mt-1 max-h-40 overflow-auto p-2 text-[11px]" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>{JSON.stringify(w, null, 2)}</pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
