import { useEffect, useRef, useState } from "react";
import type { FooterConfig, JsonSchema, Style, WidgetInstance } from "../api";
import { api } from "../api";
import { uiColor } from "../colors";
import { enumLabel, fieldTitle, useT, widgetDesc, widgetName } from "../i18n";
import { effectiveLabel, ownsLabel, useStore, widgetAt } from "../store";

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
  const t = useT();
  const hint = t.widgets.fieldHints[name];
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
              <span className="enum-name">{enumLabel(t, inst.widget, name, k)}</span>
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
  const t = useT();
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
            <b>{t.options.on}</b> {samples[0]} <b>{t.options.off}</b> {samples[1]}
          </span>
        )}
      </span>
      <input type="checkbox" className="h-4 w-4" checked={current} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Field({ name, schema, value, fallback, inst, onChange }: { name: string; schema: JsonSchema; value: unknown; fallback: unknown; inst: WidgetInstance; onChange: (v: unknown) => void }) {
  const t = useT();
  const { base, nullable } = typeOf(schema);
  const title = fieldTitle(t, name, schema);
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
          placeholder={effective === null ? t.options.hidden : ""}
          onChange={(v) => onChange(v)}
        />
        {nullable && (
          <button className="btn" onClick={() => onChange(effective === null ? (schema.default ?? "") : null)}>
            {effective === null ? t.options.show : t.options.hide}
          </button>
        )}
      </span>
    </label>
  );
}

/** Theme tokens offered as colors, in display order; their labels live in `options.colors`. */
const TOKENS = ["", "fg", "muted", "accent", "ok", "warn", "crit"];

function ColorField({ style, setStyle }: { style: Style; setStyle: (p: Partial<Style>) => void }) {
  const t = useT();
  const themes = useStore((s) => s.themes);
  const theme = useStore((s) => s.config?.theme);
  const tokens = typeof theme === "string" ? themes.find((t) => t.name === theme)?.tokens : theme?.tokens;
  const fg = style.fg ?? "";
  const custom = fg !== "" && !TOKENS.includes(fg);
  return (
    <div className="enum">
      <span className="enum-title">{t.options.color}</span>
      <div className="swatches" role="radiogroup" aria-label={t.options.color}>
        {TOKENS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={fg === k} className="swatch" data-active={fg === k} onClick={() => setStyle({ fg: k || undefined })} title={t.options.colors[k]}>
            <i style={{ background: k ? uiColor(tokens?.[k]) : "transparent", borderStyle: k ? "solid" : "dashed" }} />
            {t.options.colors[k]}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={custom} className="swatch" data-active={custom} onClick={() => !custom && setStyle({ fg: "#ffffff" })}>
          <i style={{ background: custom ? fg : "transparent", borderStyle: custom ? "solid" : "dashed" }} />
          {t.options.custom}
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(fg) ? fg : "#ffffff"} onChange={(e) => setStyle({ fg: e.target.value })} aria-label={t.options.pickColor} />
          <TextField className="field mono !w-32" value={fg} onChange={(v) => setStyle({ fg: v })} placeholder="#rrggbb" />
        </div>
      )}
    </div>
  );
}

export function Options() {
  const t = useT();
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

  return (
    <div className="drawer-backdrop" onClick={() => s.select(null)}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.options.dialog}>
        <div className="sheet-head">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{widgetName(t, manifest, w.widget)}</h3>
            <div className="hint">
              {t.options.where(sel.line + 1, t.layout.zones[sel.zone])} · <span className="mono">{w.widget}</span>
            </div>
          </div>
          <button className="btn ml-auto" onClick={() => s.select(null)}>
            {t.options.done}
          </button>
        </div>
        <div className="live">
          <span className="hint">{t.options.now}</span>
          <span className="mono live-text">{live[0] || t.options.nothingNow}</span>
        </div>
        <div className="sheet-body">
          <p className="hint">{widgetDesc(t, manifest, w.widget)}</p>
          <label className="row">
            <span>
              {t.options.label}
              <span className="hint ml-2">{t.options.labelHint}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <TextField
                className="field mono !w-40"
                disabled={label === null}
                value={label ?? ""}
                placeholder={label === null ? t.options.hidden : ""}
                onChange={(v) => setLabel(v === defaultLabel ? undefined : v)}
              />
              <button className="btn" onClick={() => setLabel(label === null ? defaultLabel || widgetName(t, manifest, w.widget) : null)}>
                {label === null ? t.options.show : t.options.hide}
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
            <span>{t.options.bold}</span>
            <input type="checkbox" className="h-4 w-4" checked={!!style.bold} onChange={(e) => setStyle({ bold: e.target.checked })} />
          </label>
          <div className="mt-2 flex justify-between pt-3" style={{ borderTop: "1px solid var(--line)" }}>
            <button className="btn btn-danger" onClick={() => s.removeAt(sel)}>
              {t.options.removeWidget}
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
