import { useId } from "react";
import type { JsonSchema, Style, WidgetInstance, Zone } from "../api";
import { uiColor } from "../colors";
import { enumLabel, fieldTitle, useT, widgetDesc, widgetName } from "../i18n";
import { useProbe } from "../probe";
import { effectiveLabel, hasCenter, ownsLabel, useStore, widgetAt } from "../store";
import { Ansi } from "./Ansi";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";
import { TextField } from "./TextField";

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
              {/* ❯ marks the current value, as in Claude Code's own menus; aria-checked says it to AT. */}
              <span className="enum-ptr" aria-hidden="true">
                ❯
              </span>
              <span className="enum-name">{enumLabel(t, inst.widget, name, k)}</span>
              <span className="enum-sample">{samples[i] === undefined ? "…" : <Ansi text={samples[i]!} fallback="—" />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Booleans show both outcomes, one under the other, so the difference reads at a glance — and say
 * so plainly when the current data makes them look identical (e.g. a link toggle on plain text).
 */
function BoolField({ title, current, inst, name, onChange }: { title: string; current: boolean; inst: WidgetInstance; name: string; onChange: (v: boolean) => void }) {
  const t = useT();
  const id = useId();
  const samples = useProbe([
    { ...inst, options: { ...(inst.options ?? {}), [name]: true } },
    { ...inst, options: { ...(inst.options ?? {}), [name]: false } },
  ]);
  const ready = samples.length === 2;
  const same = ready && samples[0] === samples[1];
  return (
    <div className="bool">
      <div className="row">
        <label htmlFor={id}>{title}</label>
        <input id={id} type="checkbox" className="h-4 w-4" checked={current} onChange={(e) => onChange(e.target.checked)} />
      </div>
      {ready &&
        (same ? (
          <span className="hint">{t.options.noDifference}</span>
        ) : (
          <div className="bool-compare" aria-hidden="true">
            <span className="bool-tag" data-active={current}>
              {t.options.on}
            </span>
            <Ansi text={samples[0]!} fallback="—" />
            <span className="bool-tag" data-active={!current}>
              {t.options.off}
            </span>
            <Ansi text={samples[1]!} fallback="—" />
          </div>
        ))}
    </div>
  );
}

/**
 * Why an option currently has no effect, from its schema's `x-requires` (e.g. cacheGlyph needs
 * style = arrows): the first unmet requirement as a sentence, or null when it applies.
 */
function unmetRequirement(t: ReturnType<typeof useT>, widgetId: string, schema: JsonSchema, inst: WidgetInstance, defaults: Record<string, unknown>, siblings: Record<string, JsonSchema>): string | null {
  const req = schema["x-requires"];
  if (!req || typeof req !== "object") return null;
  for (const [k, want] of Object.entries(req as Record<string, unknown>)) {
    const cur = inst.options?.[k] !== undefined ? inst.options[k] : defaults[k];
    if (cur === want) continue;
    const valueLabel = typeof want === "boolean" ? (want ? t.options.on : t.options.off) : enumLabel(t, widgetId, k, String(want));
    return t.options.needs(fieldTitle(t, k, siblings[k] ?? {}), valueLabel);
  }
  return null;
}

/** An option row, dimmed with a one-line reason when it can't affect the output right now. */
function Field(props: { name: string; schema: JsonSchema; value: unknown; fallback: unknown; inst: WidgetInstance; defaults: Record<string, unknown>; siblings: Record<string, JsonSchema>; onChange: (v: unknown) => void }) {
  const t = useT();
  const needs = unmetRequirement(t, props.inst.widget, props.schema, props.inst, props.defaults, props.siblings);
  return (
    <div className="field-wrap" data-inactive={needs !== null}>
      <FieldControl {...props} />
      {needs && <span className="hint needs">{needs}</span>}
    </div>
  );
}

function FieldControl({ name, schema, value, fallback, inst, onChange }: { name: string; schema: JsonSchema; value: unknown; fallback: unknown; inst: WidgetInstance; onChange: (v: unknown) => void }) {
  const t = useT();
  const id = useId();
  const { base, nullable } = typeOf(schema);
  const title = fieldTitle(t, name, schema);
  const effective = value === undefined ? (fallback === undefined ? schema.default : fallback) : value;

  if (schema.enum) return <EnumField title={title} values={schema.enum} current={effective} inst={inst} name={name} onChange={onChange} />;
  if (base === "boolean") return <BoolField title={title} current={Boolean(effective)} inst={inst} name={name} onChange={onChange} />;
  if (base === "integer" || base === "number") {
    return (
      <div className="row">
        <label htmlFor={id}>{title}</label>
        <input
          id={id}
          className="field !w-24"
          type="number"
          min={schema.minimum}
          max={schema.maximum}
          value={effective === null || effective === undefined ? "" : Number(effective)}
          onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : schema.default) : Number(e.target.value))}
        />
      </div>
    );
  }
  return (
    <div className="row">
      <label htmlFor={id}>{title}</label>
      <span className="flex items-center gap-1.5">
        <TextField
          id={id}
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
    </div>
  );
}

/** Theme tokens offered as colors, in display order; their labels live in `options.colors`. */
const TOKENS = ["", "fg", "muted", "accent", "ok", "warn", "crit"];

function ColorField({ style, setStyle }: { style: Style; setStyle: (p: Partial<Style>) => void }) {
  const t = useT();
  const themes = useStore((s) => s.themes);
  const theme = useStore((s) => s.config?.theme);
  const tokens = typeof theme === "string" ? themes.find((th) => th.name === theme)?.tokens : theme?.tokens;
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
          <TextField className="field mono !w-32" value={fg} onChange={(v) => setStyle({ fg: v })} placeholder="#rrggbb" ariaLabel={t.options.pickColor} />
        </div>
      )}
    </div>
  );
}

/** Move the widget with two selects — the mouse-free, drag-free way to put it anywhere. */
function PositionField({ line, zone }: { line: number; zone: Zone }) {
  const t = useT();
  const s = useStore();
  const zones: Zone[] = hasCenter(s) ? ["left", "center", "right"] : ["left", "right"];
  const moveTo = (l: number, z: Zone) => {
    if (l === line && z === zone) return;
    const len = s.config!.lines[l]?.[z]?.length ?? 0;
    s.moveWidget(s.selection!, l, z, len);
    s.select({ line: l, zone: z, index: len }); // appended at the end of the target zone
  };
  return (
    <div className="row">
      <span>{t.options.position}</span>
      <span className="flex items-center gap-1.5">
        <select className="field !w-auto" value={line} onChange={(e) => moveTo(Number(e.target.value), zone)} aria-label={t.options.position}>
          {s.config!.lines.map((_, i) => (
            <option key={i} value={i}>
              {t.options.lineN(i + 1)}
            </option>
          ))}
        </select>
        <select className="field !w-auto" value={zone} onChange={(e) => moveTo(line, e.target.value as Zone)} aria-label={t.layout.zones[zone]}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {t.layout.zones[z]}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

function OptionsBody() {
  const t = useT();
  const s = useStore();
  const labelId = useId();
  const sel = s.selection!;
  const w = widgetAt(s, sel)!;
  const live = useProbe([w]);
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
    <>
      <div className="sheet-head">
        <div className="min-w-0">
          <h3 className="sheet-title">{widgetName(t, manifest, w.widget)}</h3>
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
        <span className="live-text">{live[0] === undefined ? "…" : <Ansi text={live[0]} fallback={t.options.nothingNow} />}</span>
      </div>
      <div className="sheet-body">
        <p className="hint">{widgetDesc(t, manifest, w.widget)}</p>
        <PositionField line={sel.line} zone={sel.zone} />
        <div className="row">
          <label htmlFor={labelId}>
            {t.options.label}
            <span className="hint ml-2">{t.options.labelHint}</span>
          </label>
          <span className="flex items-center gap-1.5">
            <TextField
              id={labelId}
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
        </div>
        {props.map(([name, schema]) => (
          <Field
            key={name}
            name={name}
            schema={schema}
            value={w.options?.[name]}
            fallback={manifest?.defaults[name]}
            inst={w}
            defaults={manifest?.defaults ?? {}}
            siblings={manifest?.schema.properties ?? {}}
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
        <BoldField bold={!!style.bold} onChange={(b) => setStyle({ bold: b })} />
        <div className="sheet-foot">
          <button className="btn btn-danger" onClick={() => s.removeAt(sel)}>
            <Icon name="x" size={14} />
            {t.options.removeWidget}
          </button>
          <details className="text-xs">
            <summary className="hint cursor-pointer">JSON</summary>
            <pre className="mono mt-1 max-h-40 overflow-auto p-2 text-xs" style={{ background: "var(--bg-deep)", borderRadius: "var(--r-1)" }}>
              {JSON.stringify(w, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </>
  );
}

function BoldField({ bold, onChange }: { bold: boolean; onChange: (b: boolean) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="row">
      <label htmlFor={id}>{t.options.bold}</label>
      <input id={id} type="checkbox" className="h-4 w-4" checked={bold} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function Options() {
  const t = useT();
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const hasWidget = useStore((s) => widgetAt(s, s.selection) !== null);
  if (!selection || !hasWidget) return null;
  return (
    <Drawer label={t.options.dialog} onClose={() => select(null)}>
      <OptionsBody />
    </Drawer>
  );
}
