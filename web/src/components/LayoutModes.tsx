import type { LineConfig } from "../api";
import { CAT_COLOR } from "../colors";
import { useT } from "../i18n";
import { layoutMode, PRESETS, useStore, type PresetId } from "../store";

/** The most lines any preset has: every sketch reserves this many rows so the cards line up. */
const SKETCH_ROWS = Math.max(...Object.values(PRESETS).map((p) => p.lines.length));

/**
 * A layout drawn as a thumbnail: one row per line, one bar per widget in its category colour, left
 * and right zones pushed apart as on the real line. Bar widths follow the length of each widget's
 * sample output, so a wide widget (a context bar) reads wider than a short one.
 */
function Sketch({ lines }: { lines: LineConfig[] }) {
  const widgets = useStore((s) => s.widgets);
  const bar = (id: string, i: number) => {
    const m = widgets.find((w) => w.id === id);
    const cat = m?.category ?? id.split(".")[0] ?? "misc";
    // A sample's length ≈ its rendered width in columns; as a share of a ~60-column line it scales
    // with the sketch. Bars may shrink (flex) when a busy line would overflow, but keep their ratios.
    const share = Math.min(40, Math.max(6, ((m?.sample?.length ?? 10) / 60) * 100));
    return <i key={i} style={{ flexBasis: `${share}%`, background: CAT_COLOR[cat] ?? CAT_COLOR.misc }} />;
  };
  return (
    <span className="sketch" aria-hidden="true">
      {Array.from({ length: SKETCH_ROWS }, (_, r) => {
        const l = lines[r];
        return (
          <span key={r} className="sk-line" data-empty={!l}>
            <span className="sk-zone">{(l?.left ?? []).map((w, i) => bar(w.widget, i))}</span>
            <span className="sk-zone">{(l?.right ?? []).map((w, i) => bar(w.widget, i))}</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The first choice on the page: a preset, or Custom. Presets are the common case, so they come
 * before anything else; the line editor and the tray of widgets belong to Custom and only show
 * there. Hovering a preset tries it on in the preview.
 */
export function LayoutModes() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const mode = useStore(layoutMode);
  const lastCustom = useStore((s) => s.lastCustom);
  const chooseLayout = useStore((s) => s.chooseLayout);
  const setTryOn = useStore((s) => s.setTryOn);
  const ids = Object.keys(PRESETS) as PresetId[];
  // The Custom card shows the custom layout: the one being edited, or the one kept aside.
  const customLines = mode === "custom" ? config.lines : lastCustom;
  return (
    <div className="modes" role="radiogroup" aria-label={t.layout.title}>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          className="mode"
          onMouseEnter={() => mode !== id && setTryOn({ patch: { lines: PRESETS[id].lines }, label: t.presets[id].name })}
          onMouseLeave={() => setTryOn(null)}
          onClick={() => {
            setTryOn(null);
            chooseLayout(id);
          }}
        >
          <Sketch lines={PRESETS[id].lines} />
          <span className="mode-text">
            <span className="mode-name">
              {t.presets[id].name}
              <small>{t.presets.lines(PRESETS[id].lines.length)}</small>
            </span>
            <span className="hint">{t.presets[id].blurb}</span>
          </span>
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={mode === "custom"}
        className="mode"
        onClick={() => {
          setTryOn(null);
          chooseLayout("custom");
        }}
      >
        {customLines ? <Sketch lines={customLines} /> : <span className="sketch sketch-blank" aria-hidden="true" />}
        <span className="mode-text">
          <span className="mode-name">
            {t.presets.custom.name}
            {customLines && <small>{t.presets.lines(customLines.length)}</small>}
          </span>
          <span className="hint">{t.presets.custom.blurb}</span>
        </span>
      </button>
    </div>
  );
}
