import { useMemo, useState } from "react";
import { categoryName, useT, widgetDesc, widgetName } from "../i18n";
import { useStore } from "../store";

export function Picker() {
  const t = useT();
  const { widgets, picker, closePicker, addWidget } = useStore();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Search both the manifest (English) text and the localized text, so either language finds it.
    const list = widgets.filter((w) => !needle || `${w.id} ${w.name} ${w.description} ${widgetName(t, w, w.id)} ${widgetDesc(t, w, w.id)}`.toLowerCase().includes(needle));
    const map = new Map<string, typeof list>();
    for (const w of list) map.set(w.category, [...(map.get(w.category) ?? []), w]);
    return [...map.entries()];
  }, [widgets, q, t]);
  if (!picker) return null;
  return (
    <div className="drawer-backdrop" onClick={closePicker}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.picker.dialog}>
        <div className="sheet-head">
          <input autoFocus className="field" placeholder={t.picker.search} aria-label={t.picker.search} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && closePicker()} />
          <span className="hint whitespace-nowrap">{t.picker.target(picker.line + 1, t.layout.zones[picker.zone])}</span>
        </div>
        <div className="drawer-scroll p-4">
          {groups.map(([cat, list]) => (
            <div key={cat} className="mb-4">
              <div className="cat-head">{categoryName(t, cat)}</div>
              <div className="grid grid-cols-1 gap-1.5">
                {list.map((w) => (
                  <button key={w.id} className="pick" onClick={() => addWidget(picker.line, picker.zone, w.id)}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{widgetName(t, w, w.id)}</span>
                      {w.source === "plugin" && <span className="tag">{t.picker.plugin}</span>}
                    </div>
                    {w.sample && <div className="mono sample truncate">{w.sample}</div>}
                    <div className="hint mt-0.5">{widgetDesc(t, w, w.id)}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <div className="hint p-4">{t.picker.noMatch}</div>}
        </div>
      </aside>
    </div>
  );
}
