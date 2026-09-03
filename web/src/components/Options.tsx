import { useEffect, useRef, useState } from "react";
import type { FooterConfig, JsonSchema, Style, WidgetInstance } from "../api";
import { api } from "../api";
import { uiColor } from "../colors";
import { descOf, effectiveLabel, nameOf, ownsLabel, useStore, widgetAt } from "../store";

const ZH_FIELD: Record<string, string> = {
  label: "标签",
  format: "格式",
  brackets: "整体加方括号",
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
  window: "窗口",
  effortStyle: "思考强度写法",
  effortParens: "思考强度加括号",
  joiner: "各段之间用",
  showWindow: "带上下文窗口大小",
  showTokens: "显示已用/总量 tokens",
  showBar: "显示进度条",
  showPercent: "显示百分比",
  parens: "加括号",
  date: "显示日期",
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
  "1": "1 级",
  "2": "2 级",
  "3": "3 级",
};

/** One-line legends shown next to a field title. */
const ZH_FIELD_HINT: Record<string, string> = {
  effortStyle: "符号对应：○ low · ◔ medium · ◑ high · ◕ xhigh · ● max",
};

/** Per-widget enum wording where the generic words would hide what the option actually does. */
const ZH_ENUM_BY_FIELD: Record<string, Record<string, string>> = {
  "model.badge.format": { full: "原样", compact: "去掉 (1M context)", short: "再去掉 Claude 前缀" },
  "model.badge.effortStyle": { "symbol-word": "符号 + 文字", word: "只文字", symbol: "只符号" },
  "model.effort.effortStyle": { "symbol-word": "符号 + 文字", word: "只文字", symbol: "只符号" },
  "model.badge.joiner": { space: "空格", dot: "圆点 ·" },
  "context.bar.value": { percent: "已用 %", remaining: "剩余 %" },
};

const ANSI = /\x1b\][^\x07]*\x07|\x1b\[[0-9;]*m/g; // eslint-disable-line no-control-regex

const PROBE_BASE: Omit<FooterConfig, "theme"> = {
  version: 1,
  colorLevel: "none",
  separator: " ",
  columnsOffset: 0,
  lines: [],
  git: { enabled: true, cacheMs: 2000 },
  plugins: { dirs: [] },
  captureSamples: false,
};

/** Render one widget instance against the current sample and return plain text. */
function useProbe(insts: WidgetInstance[]): string[] {
  const sampleId = useStore((s) => s.sampleId);
  const theme = useStore((s) => s.config?.theme);
  const [out, setOut] = useState<string[]>([]);
  const key = JSON.stringify([insts, sampleId]);
  useEffect(() => {
    let alive = true;
    Promise.all(
      insts.map(async (probe) => {
        const r = await api.render({ ...PROBE_BASE, theme: theme ?? "default", lines: [{ left: [probe] }] }, sampleId, 0, true).catch(() => null);
        return r?.lines[0]?.replace(ANSI, "").trim() ?? "";
      }),
    ).then((texts) => alive && setOut(texts));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return out;
}

/*
  Text inputs keep a local draft while focused. Driving the value straight from the store
  re-renders the whole config on every keystroke, which interrupts IME composition and can
  swallow characters; the store is still updated on every change, the draft just owns the caret.
*/
function TextField({ value, onChange, className, disabled, placeholder }: { value: string; onChange: (v: string) => void; className?: string; disabled?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return (
    <input
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      value={draft}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setDraft(value);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

function typeOf(schema: JsonSchema) {
  const t = Array.isArray(schema.type) ? schema.type : [schema.type ?? "string"];
  return { base: t.find((x) => x !== "null") ?? "string", nullable: t.includes("null") };
}

/** Every value of an enum shows what it renders to, so nobody has to guess what "compact" means. */
function EnumField({ title, values, current, inst, name, onChange }: { title: string; values: unknown[]; current: unknown; inst: WidgetInstance; name: string; onChange: (v: unknown) => void }) {
  const probes = values.map((v) => ({ ...inst, options: { ...(inst.options ?? {}), [name]: v } }));
  const samples = useProbe(probes);
  const wording = ZH_ENUM_BY_FIELD[`${inst.widget}.${name}`] ?? ZH_ENUM;
  const nameOfValue = (k: string) => wording[k] ?? ZH_ENUM[k] ?? k;
  const hint = ZH_FIELD_HINT[name];
  return (
    <div className="enum">
      <span className="enum-title">
        {title}
        {hint && <span className="hint ml-2">{hint}</span>}
      </span>
      <div className="enum-options" role="radiogroup" aria-label={title}>
        {values.map((v, i) => {
          const k = String(v);
          const active = String(current ?? "") === k;
          return (
            <button key={k} type="button" role="radio" aria-checked={active} className="enum-opt" data-active={active} onClick={() => onChange(v)}>
              <span className="enum-name">{nameOfValue(k)}</span>
              <span className="mono enum-sample">{samples[i] ?? "…"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Booleans show both outcomes too: the row states what turning it on adds. */
function BoolField({ title, current, inst, name, onChange }: { title: string; current: boolean; inst: WidgetInstance; name: string; onChange: (v: boolean) => void }) {
  const samples = useProbe([
    { ...inst, options: { ...(inst.options ?? {}), [name]: true } },
    { ...inst, options: { ...(inst.options ?? {}), [name]: false } },
  ]);
  return (
    <label className="row row-top">
      <span>
        {title}
        {samples.length === 2 && (
          <span className="mono bool-sample">
            <b>开</b> {samples[0]} <b>关</b> {samples[1]}
          </span>
        )}
      </span>
      <input type="checkbox" className="h-4 w-4" checked={current} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Field({ name, schema, value, fallback, inst, onChange }: { name: string; schema: JsonSchema; value: unknown; fallback: unknown; inst: WidgetInstance; onChange: (v: unknown) => void }) {
  const { base, nullable } = typeOf(schema);
  const title = ZH_FIELD[name] ?? schema.title ?? name;
  const effective = value === undefined ? (fallback === undefined ? schema.default : fallback) : value;

  if (schema.enum) return <EnumField title={title} values={schema.enum} current={effective} inst={inst} name={name} onChange={onChange} />;
  if (base === "boolean") return <BoolField title={title} current={Boolean(effective)} inst={inst} name={name} onChange={onChange} />;
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
        <TextField
          className="field mono !w-40"
          disabled={effective === null}
          value={effective === null || effective === undefined ? "" : String(effective)}
          placeholder={effective === null ? "已隐藏" : ""}
          onChange={(v) => onChange(v)}
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

function ColorField({ style, setStyle }: { style: Style; setStyle: (p: Partial<Style>) => void }) {
  const themes = useStore((s) => s.themes);
  const theme = useStore((s) => s.config?.theme);
  const tokens = typeof theme === "string" ? themes.find((t) => t.name === theme)?.tokens : theme?.tokens;
  const fg = style.fg ?? "";
  const custom = fg !== "" && !TOKENS.some(([k]) => k === fg);
  return (
    <div className="enum">
      <span className="enum-title">颜色</span>
      <div className="swatches" role="radiogroup" aria-label="颜色">
        {TOKENS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={fg === k} className="swatch" data-active={fg === k} onClick={() => setStyle({ fg: k || undefined })} title={label}>
            <i style={{ background: k ? uiColor(tokens?.[k]) : "transparent", borderStyle: k ? "solid" : "dashed" }} />
            {label}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={custom} className="swatch" data-active={custom} onClick={() => !custom && setStyle({ fg: "#ffffff" })}>
          <i style={{ background: custom ? fg : "transparent", borderStyle: custom ? "solid" : "dashed" }} />
          自定义
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(fg) ? fg : "#ffffff"} onChange={(e) => setStyle({ fg: e.target.value })} aria-label="选颜色" />
          <TextField className="field mono !w-32" value={fg} onChange={(v) => setStyle({ fg: v })} placeholder="#rrggbb" />
        </div>
      )}
    </div>
  );
}

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
  const live = useProbe(w ? [w] : []);
  if (!sel || !w) return null;
  const manifest = s.widgets.find((m) => m.id === w.widget);
  const props = Object.entries(manifest?.schema.properties ?? {}).filter(([name]) => name !== "label");
  const style: Style = w.style ?? {};
  const setStyle = (patch: Partial<Style>) =>
    s.updateAt(sel, (inst) => {
      const next: Style = { ...(inst.style ?? {}), ...patch };
      for (const k of Object.keys(next) as (keyof Style)[]) if (!next[k]) delete next[k];
      if (Object.keys(next).length) inst.style = next;
      else delete inst.style;
    });
  const label = effectiveLabel(w, manifest);
  const defaultLabel = ownsLabel(manifest) && typeof manifest!.defaults.label === "string" ? (manifest!.defaults.label as string) : "";
  const setLabel = (v: string | null | undefined) =>
    s.updateAt(sel, (inst) => {
      if (inst.options && "label" in inst.options) {
        delete inst.options.label;
        if (Object.keys(inst.options).length === 0) delete inst.options;
      }
      if (v === undefined) delete inst.label;
      else inst.label = v;
    });
  const zoneName = { left: "左", center: "中", right: "右" }[sel.zone];

  return (
    <div className="drawer-backdrop" onClick={() => s.select(null)}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="修改选项">
        <div className="sheet-head">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{nameOf(manifest, w.widget)}</h3>
            <div className="hint">
              第 {sel.line + 1} 行 · 靠{zoneName} · <span className="mono">{w.widget}</span>
            </div>
          </div>
          <button className="btn ml-auto" onClick={() => s.select(null)}>
            完成
          </button>
        </div>
        <div className="live">
          <span className="hint">现在的样子</span>
          <span className="mono live-text">{live[0] || "（当前数据下没有内容）"}</span>
        </div>
        <div className="sheet-body">
          <p className="hint">{descOf(manifest, w.widget)}</p>
          <label className="row">
            <span>
              标签<span className="hint ml-2">值前面的文字</span>
            </span>
            <span className="flex items-center gap-1.5">
              <TextField
                className="field mono !w-40"
                disabled={label === null}
                value={label ?? ""}
                placeholder={label === null ? "不显示" : ""}
                onChange={(v) => setLabel(v === defaultLabel ? undefined : v)}
              />
              <button className="btn" onClick={() => setLabel(label === null ? defaultLabel || nameOf(manifest, w.widget) : null)}>
                {label === null ? "显示" : "隐藏"}
              </button>
            </span>
          </label>
          {props.map(([name, schema]) => (
            <Field
              key={name}
              name={name}
              schema={schema}
              value={w.options?.[name]}
              fallback={manifest?.defaults[name]}
              inst={w}
              onChange={(v) =>
                s.updateAt(sel, (inst) => {
                  inst.options = { ...(inst.options ?? {}), [name]: v };
                  if (v === (manifest?.defaults[name] ?? schema.default)) delete inst.options[name];
                  if (Object.keys(inst.options).length === 0) delete inst.options;
                })
              }
            />
          ))}
          <ColorField style={style} setStyle={setStyle} />
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
                <pre className="mono mt-1 max-h-40 overflow-auto p-2 text-[11px]" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
                  {JSON.stringify(w, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
