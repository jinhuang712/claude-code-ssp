import { useMemo, useState } from "react";
import { ZH_CATEGORY, nameOf, useStore } from "../store";

export function Picker() {
  const { widgets, picker, closePicker, addWidget } = useStore();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = widgets.filter((w) => !needle || `${w.id} ${w.name} ${nameOf(w, w.id)} ${w.description}`.toLowerCase().includes(needle));
    const map = new Map<string, typeof list>();
    for (const w of list) map.set(w.category, [...(map.get(w.category) ?? []), w]);
    return [...map.entries()];
  }, [widgets, q]);
  if (!picker) return null;
  return (
    <div className="overlay" onClick={closePicker}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 p-3">
          <input autoFocus className="field" placeholder="搜索…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && closePicker()} />
          <span className="whitespace-nowrap text-xs opacity-50">
            加到第 {picker.line + 1} 行 · {picker.zone === "left" ? "左边" : picker.zone === "right" ? "右边" : "中间"}
          </span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3">
          {groups.map(([cat, list]) => (
            <div key={cat} className="mb-4">
              <div className="mb-1.5 text-[11px] uppercase tracking-wider opacity-40">{ZH_CATEGORY[cat] ?? cat}</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {list.map((w) => (
                  <button key={w.id} className="card text-left !py-2" onClick={() => addWidget(picker.line, picker.zone, w.id)}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{nameOf(w, w.id)}</span>
                      {w.source === "plugin" && <span className="rounded bg-violet-500/20 px-1.5 text-[10px] text-violet-200">插件</span>}
                    </div>
                    {w.sample && <div className="mono mt-1 truncate text-xs opacity-60">{w.sample}</div>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && <div className="p-4 text-sm opacity-60">没有匹配的项目</div>}
        </div>
      </div>
    </div>
  );
}
