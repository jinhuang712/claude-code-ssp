import type { LineConfig } from "../api";
import { CAT_COLOR } from "../colors";
import { useT } from "../i18n";
import { PRESETS, useStore, type PresetId } from "../store";
import { Icon } from "./Icon";
import { Popover } from "./Popover";

/** The most lines any preset has: every sketch reserves this many rows so the choices line up. */
const SKETCH_ROWS = Math.max(...Object.values(PRESETS).map((p) => p.lines.length));

/**
 * A preset's layout drawn as a thumbnail: one row per line, one bar per widget in its category
 * colour, left and right zones pushed apart as on the real line. Bar widths follow the length of
 * each widget's sample output, so a wide widget (a context bar) reads wider than a short one.
 */
function PresetSketch({ lines }: { lines: LineConfig[] }) {
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
 * "Start from a template": the presets, behind one button next to the Layout title. They used to be
 * a section of three large cards above the layout, which a customised layout never needs again —
 * picking one replaces the lines, so it belongs with the lines. Hover or focus tries one on.
 */
export function Templates() {
  const t = useT();
  const config = useStore((s) => s.config)!;
  const applyPreset = useStore((s) => s.applyPreset);
  const setTryOn = useStore((s) => s.setTryOn);
  const ids = Object.keys(PRESETS) as PresetId[];
  // Compare shape only (which widgets, in which zone, in which order); ignore empty zones and per-widget tweaks.
  const sig = (lines: LineConfig[]) => lines.map((l) => (["left", "center", "right"] as const).map((z) => (l[z] ?? []).map((w) => w.widget).join(",")).join("|")).join("\n");
  const current = ids.find((id) => sig(PRESETS[id].lines) === sig(config.lines));
  return (
    <Popover
      label={t.presets.title}
      buttonClassName="btn btn-ghost"
      buttonContent={
        <>
          {t.presets.title}
          <Icon name="chevron" size={12} className="rotate-90" />
        </>
      }
      align="end"
    >
      {(close) => (
        <div className="templates">
          <p className="hint">{current ? t.presets.matches : t.presets.customised}</p>
          {ids.map((id) => {
            const tryOn = () => setTryOn({ patch: { lines: PRESETS[id].lines }, label: t.presets[id].name });
            return (
              <button
                key={id}
                className="template"
                data-active={current === id}
                aria-pressed={current === id}
                onMouseEnter={tryOn}
                // Keyboard focus only: opening the menu focuses the first template, and a mouse
                // click on "Start from a template" shouldn't silently preview Minimal.
                onFocus={(e) => e.currentTarget.matches(":focus-visible") && tryOn()}
                onMouseLeave={() => setTryOn(null)}
                onBlur={() => setTryOn(null)}
                onClick={() => {
                  setTryOn(null);
                  applyPreset(id);
                  close();
                }}
              >
                <PresetSketch lines={PRESETS[id].lines} />
                <span className="template-text">
                  <span className="template-name">
                    {t.presets[id].name}
                    <small>{t.presets.lines(PRESETS[id].lines.length)}</small>
                  </span>
                  <span className="hint">{t.presets[id].blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
