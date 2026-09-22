import { useMemo, useState } from "react";
import type { WidgetManifest } from "../api";
import { CAT_COLOR } from "../colors";
import { categoryName, useT, widgetDesc, widgetName } from "../i18n";
import { useProbe } from "../probe";
import { useStore } from "../store";
import { Ansi } from "./Ansi";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";

/** Reading order for categories: what a statusline is *about* first, bookkeeping last. */
const CATEGORY_ORDER = ["model", "project", "git", "context", "usage", "tokens", "cost", "session", "activity", "environment", "misc"];
const rank = (cat: string) => {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
};

/**
 * The list body only mounts while the picker is open, so the batch of live previews (one per
 * widget, rendered against the current session) is only requested when someone is looking.
 */
function PickerBody({ picker }: { picker: { line: number; zone: "left" | "center" | "right" } }) {
  const t = useT();
  const widgets = useStore((s) => s.widgets);
  const config = useStore((s) => s.config);
  const addWidget = useStore((s) => s.addWidget);
  const closePicker = useStore((s) => s.closePicker);
  const [q, setQ] = useState("");
  const inUse = useMemo(() => new Set(config?.lines.flatMap((l) => [...(l.left ?? []), ...(l.center ?? []), ...(l.right ?? [])].map((w) => w.widget)) ?? []), [config]);
  const insts = useMemo(() => widgets.map((w) => ({ widget: w.id })), [widgets]);
  const live = useProbe(insts);
  const liveOf = new Map(widgets.map((w, i) => [w.id, live[i] ?? ""]));

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Search both the manifest (English) text and the localized text, so either language finds it.
    const list = widgets.filter((w) => !needle || `${w.id} ${w.name} ${w.description} ${widgetName(t, w, w.id)} ${widgetDesc(t, w, w.id)}`.toLowerCase().includes(needle));
    const map = new Map<string, WidgetManifest[]>();
    for (const w of list) map.set(w.category, [...(map.get(w.category) ?? []), w]);
    return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [widgets, q, t]);

  return (
    <>
      <div className="sheet-head sheet-head-stack">
        <div className="flex items-center gap-2">
          <h3 className="sheet-title">{t.picker.dialog}</h3>
          <span className="hint ml-auto whitespace-nowrap">{t.picker.target(picker.line + 1, t.layout.zones[picker.zone])}</span>
          <button className="btn btn-ghost btn-icon" onClick={closePicker} aria-label={t.picker.close} title={t.picker.close}>
            <Icon name="x" />
          </button>
        </div>
        <label className="search">
          <Icon name="search" />
          <input autoFocus type="search" className="field" placeholder={t.picker.search} aria-label={t.picker.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="drawer-scroll p-4">
        {groups.map(([cat, list]) => (
          <div key={cat} className="mb-4">
            <div className="cat-head">
              {categoryName(t, cat)}
              <span className="cat-count">{list.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {list.map((w) => (
                <button key={w.id} className="pick" style={{ ["--cat" as string]: CAT_COLOR[w.category] ?? CAT_COLOR.misc }} onClick={() => addWidget(picker.line, picker.zone, w.id)}>
                  <div className="flex items-baseline gap-2">
                    <span className="pick-name">{widgetName(t, w, w.id)}</span>
                    {w.source === "plugin" && <span className="tag">{t.picker.plugin}</span>}
                    {inUse.has(w.id) && <span className="tag">{t.picker.inUse}</span>}
                  </div>
                  {/* Live render against the current session; the manifest's static sample until it arrives. */}
                  <div className="sample">
                    <Ansi text={liveOf.get(w.id) ?? ""} fallback={w.sample ?? ""} />
                  </div>
                  <div className="hint mt-0.5">{widgetDesc(t, w, w.id)}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <div className="hint p-4">{t.picker.noMatch}</div>}
      </div>
    </>
  );
}

export function Picker() {
  const t = useT();
  const picker = useStore((s) => s.picker);
  const closePicker = useStore((s) => s.closePicker);
  if (!picker) return null;
  return (
    <Drawer label={t.picker.dialog} onClose={closePicker}>
      <PickerBody picker={picker} />
    </Drawer>
  );
}
